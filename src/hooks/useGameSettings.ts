import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULTS,
  normalizeSettings,
  type GameSettings,
  type SettingKey,
} from "@/lib/settings/schema";

/**
 * Unified ChessOX settings store.
 *
 * localStorage is the offline-first source of truth (instant apply, no flicker on
 * reload); on top of it the whole object syncs to the `user_settings` table so it
 * follows the user across devices. A single window event broadcasts changes so
 * every board / component re-renders the moment a setting flips.
 *
 * PERFORMANCE — the settings live in one module-level snapshot rather than one
 * copy per hook instance. `useGameSettings` is mounted in 17 components (the
 * board, both player cards, every settings panel), and `readGameSettings` is on
 * the audio and haptics paths, which fire on every move. With per-instance
 * state each of those did its own `localStorage.getItem` + `JSON.parse` +
 * `normalizeSettings` — a synchronous main-thread read per consumer per change,
 * and a brand-new object identity each time, which defeated every downstream
 * `React.memo` and `useMemo` that depended on `settings`.
 *
 * Now: one parse per actual change, shared by everyone, and a stable identity
 * so an unrelated re-render never repaints the board. `lastRaw` additionally
 * drops no-op writes and duplicate cross-tab `storage` events before they can
 * notify anyone.
 */

const KEY = "chessox:gameSettings";
export const SETTINGS_EVENT = "chessox:settingschange";
/** Legacy key from the board-only settings era — migrated on first load. */
const LEGACY_KEY = "chessox:boardSettings";

function migrateLegacy(): Partial<GameSettings> {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "null");
    if (!legacy) return {};
    return {
      board_theme: legacy.boardTheme,
      piece_theme: legacy.pieceTheme,
      sound_master: legacy.soundEnabled,
      show_coordinates: legacy.showCoords,
      auto_flip: legacy.autoFlip,
    };
  } catch {
    return {};
  }
}

/** Build settings from an already-read localStorage value. */
function parseSettings(raw: string | null): GameSettings {
  try {
    if (raw) return normalizeSettings(JSON.parse(raw));
    // First run in the unified era — seed from any legacy board settings.
    return normalizeSettings(migrateLegacy());
  } catch {
    return DEFAULTS;
  }
}

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

// ── Shared snapshot ────────────────────────────────────────────────────
// `snapshot` is the single live settings object; `lastRaw` is the exact
// localStorage string it was built from, which is what lets a re-read be
// skipped when nothing actually changed.
let snapshot: GameSettings | null = null;
let lastRaw: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function getSnapshot(): GameSettings {
  if (snapshot === null) {
    if (typeof window === "undefined") return DEFAULTS;
    lastRaw = readRaw();
    snapshot = parseSettings(lastRaw);
  }
  return snapshot;
}

/** SSR has no localStorage; DEFAULTS is a module constant, so identity is stable. */
function getServerSnapshot(): GameSettings {
  return DEFAULTS;
}

/** Re-read from localStorage, but only notify when the stored value moved. */
function refreshFromStorage() {
  if (typeof window === "undefined") return;
  const raw = readRaw();
  if (raw === lastRaw && snapshot !== null) return;
  lastRaw = raw;
  snapshot = parseSettings(raw);
  notify();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== "undefined") {
    window.addEventListener(SETTINGS_EVENT, refreshFromStorage);
    window.addEventListener("storage", refreshFromStorage); // cross-tab / cross-device
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener(SETTINGS_EVENT, refreshFromStorage);
      window.removeEventListener("storage", refreshFromStorage);
    }
  };
}

export function readGameSettings(): GameSettings {
  return getSnapshot();
}

/** Persist to localStorage and broadcast so all listeners update instantly. */
export function writeGameSettings(next: GameSettings) {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(next);
  localStorage.setItem(KEY, raw);
  // Adopt the object we already hold instead of parsing back what we just
  // wrote, and record its serialization so the event dispatched below is
  // recognised as our own and doesn't trigger a redundant re-read.
  const changed = raw !== lastRaw;
  lastRaw = raw;
  snapshot = next;
  window.dispatchEvent(new Event(SETTINGS_EVENT));
  if (changed) notify();
}

/** Merge a patch into the current settings, persist locally + to the profile. */
export function patchGameSettings(patch: Partial<GameSettings>): GameSettings {
  // Merge onto the live snapshot rather than re-reading and re-parsing it.
  const next = normalizeSettings({ ...getSnapshot(), ...patch });
  writeGameSettings(next);
  import("@/lib/settings/settings-sync").then((m) => m.persistSettingsToDb(patch)).catch(() => {});
  return next;
}

export function useGameSettings() {
  // Every consumer reads the same object. `patchGameSettings` notifies the
  // store, so these no longer need to thread the result back through local
  // state — which is what used to give each consumer its own identity.
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((patch: Partial<GameSettings>) => {
    patchGameSettings(patch);
  }, []);

  const set = useCallback(<K extends SettingKey>(key: K, value: GameSettings[K]) => {
    patchGameSettings({ [key]: value } as Partial<GameSettings>);
  }, []);

  const reset = useCallback(() => {
    patchGameSettings({ ...DEFAULTS });
  }, []);

  return { settings, update, set, reset };
}
