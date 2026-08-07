// =====================================================================
// useEngine — React binding for the shared Stockfish instance
// ---------------------------------------------------------------------
// Subscribes a component to the engine's live search state and exposes
// imperative start/stop plus user-tunable settings (MultiPV, threads,
// hash, depth cap) persisted to localStorage. The engine itself is a
// module-level singleton (see stockfishEngine.ts) so switching pages
// never re-downloads or re-initialises the WASM binary.
// =====================================================================
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_ENGINE_OPTIONS,
  ENGINE_LIMITS,
  clampEngineOptions,
  getSharedEngine,
  type EngineOptions,
  type EngineStatus,
  type SearchSnapshot,
} from "@/lib/engine/stockfishEngine";

const SETTINGS_KEY = "chessox-engine-settings";

export type EngineSettings = EngineOptions & {
  /** Depth cap for live analysis; 0 means analyse forever (infinite). */
  depthLimit: number;
};

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  ...DEFAULT_ENGINE_OPTIONS,
  depthLimit: 0,
};

function loadSettings(): EngineSettings {
  if (typeof localStorage === "undefined") return DEFAULT_ENGINE_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_ENGINE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<EngineSettings>;
    const depthLimit =
      typeof parsed.depthLimit === "number" &&
      parsed.depthLimit >= 0 &&
      parsed.depthLimit <= ENGINE_LIMITS.depth.max
        ? Math.round(parsed.depthLimit)
        : DEFAULT_ENGINE_SETTINGS.depthLimit;
    return { ...DEFAULT_ENGINE_SETTINGS, ...clampEngineOptions(parsed), depthLimit };
  } catch {
    return DEFAULT_ENGINE_SETTINGS;
  }
}

export type UseEngine = {
  status: EngineStatus;
  /** Live snapshot of the current/most recent search (null before first). */
  snapshot: SearchSnapshot | null;
  /** True when the multi-threaded build is active (COOP/COEP present). */
  threaded: boolean;
  settings: EngineSettings;
  updateSettings: (patch: Partial<EngineSettings>) => void;
  /** Analyse a position live (infinite or capped by settings.depthLimit). */
  analyze: (fen: string) => void;
  /** Halt the current search. */
  stop: () => void;
  /** Tear down a crashed worker and start over on the last position. */
  restart: () => void;
};

export function useEngine(): UseEngine {
  const engine = useMemo(() => getSharedEngine(), []);
  const [settings, setSettings] = useState<EngineSettings>(loadSettings);
  const lastFenRef = useRef<string | null>(null);

  const snapshot = useSyncExternalStore(
    useCallback((cb) => engine.subscribe(cb), [engine]),
    () => engine.snapshot,
    () => null,
  );
  const status = useSyncExternalStore(
    useCallback((cb) => engine.subscribe(cb), [engine]),
    () => engine.status,
    () => "unloaded" as EngineStatus,
  );

  // Keep the engine's UCI options in sync with the user's settings.
  useEffect(() => {
    engine.setOptions({
      multiPv: settings.multiPv,
      threads: settings.threads,
      hash: settings.hash,
    });
  }, [engine, settings.multiPv, settings.threads, settings.hash]);

  const updateSettings = useCallback((patch: Partial<EngineSettings>) => {
    setSettings((prev) => {
      const depthLimit =
        patch.depthLimit !== undefined
          ? Math.max(0, Math.min(ENGINE_LIMITS.depth.max, Math.round(patch.depthLimit)))
          : prev.depthLimit;
      const next = { ...prev, ...clampEngineOptions(patch), depthLimit };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* private browsing — settings just won't persist */
      }
      return next;
    });
  }, []);

  const analyze = useCallback(
    (fen: string) => {
      lastFenRef.current = fen;
      engine.search(
        settings.depthLimit > 0 ? { fen, depth: settings.depthLimit } : { fen, infinite: true },
      );
    },
    [engine, settings.depthLimit],
  );

  // Re-launch the live search when the depth cap changes mid-analysis.
  useEffect(() => {
    if (lastFenRef.current && engine.status === "searching") {
      analyze(lastFenRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.depthLimit]);

  const stop = useCallback(() => {
    lastFenRef.current = null;
    engine.stop();
  }, [engine]);

  const restart = useCallback(() => {
    const fen = lastFenRef.current;
    engine.dispose();
    if (fen) analyze(fen);
  }, [engine, analyze]);

  // Memoised so the object only changes when something in it actually
  // changed. A fresh object every render made `[engine]` an effect
  // dependency that never settled, which is how a cleanup meant for unmount
  // ended up stopping the live search after every render.
  return useMemo(
    () => ({
      status,
      snapshot,
      threaded: engine.threaded,
      settings,
      updateSettings,
      analyze,
      stop,
      restart,
    }),
    [engine, status, snapshot, settings, updateSettings, analyze, stop, restart],
  );
}
