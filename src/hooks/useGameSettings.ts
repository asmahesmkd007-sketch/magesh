import { useCallback, useEffect, useState } from "react";
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

function load(): GameSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return normalizeSettings(JSON.parse(stored));
    // First run in the unified era — seed from any legacy board settings.
    return normalizeSettings(migrateLegacy());
  } catch {
    return DEFAULTS;
  }
}

export function readGameSettings(): GameSettings {
  return load();
}

/** Persist to localStorage and broadcast so all listeners update instantly. */
export function writeGameSettings(next: GameSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

/** Merge a patch into the current settings, persist locally + to the profile. */
export function patchGameSettings(patch: Partial<GameSettings>): GameSettings {
  const next = normalizeSettings({ ...load(), ...patch });
  writeGameSettings(next);
  import("@/lib/settings/settings-sync").then((m) => m.persistSettingsToDb(patch)).catch(() => {});
  return next;
}

export function useGameSettings() {
  const [settings, setSettings] = useState<GameSettings>(load);

  useEffect(() => {
    const handler = () => setSettings(load());
    window.addEventListener(SETTINGS_EVENT, handler);
    window.addEventListener("storage", handler); // cross-tab / cross-device
    return () => {
      window.removeEventListener(SETTINGS_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = useCallback((patch: Partial<GameSettings>) => {
    setSettings(patchGameSettings(patch));
  }, []);

  const set = useCallback(<K extends SettingKey>(key: K, value: GameSettings[K]) => {
    setSettings(patchGameSettings({ [key]: value } as Partial<GameSettings>));
  }, []);

  const reset = useCallback(() => {
    setSettings(patchGameSettings({ ...DEFAULTS }));
  }, []);

  return { settings, update, set, reset };
}
