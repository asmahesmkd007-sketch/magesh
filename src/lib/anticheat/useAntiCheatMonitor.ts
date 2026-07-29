// =====================================================================
// ANTI-CHEAT — game-page monitor hook
// ---------------------------------------------------------------------
// The single integration point between live games and the anti-cheat
// system. Mounts the client detector while the local user is an ACTIVE
// PLAYER (never for spectators), registers the device fingerprint once
// per session, and pings the server when the game ends so the post-game
// analysis pipeline picks it up even for resignations/timeouts.
//
// The detector and fingerprint modules are browser-only. They load
// through createClientOnlyFn, so their bodies are stripped from the
// server build (this hook is reached from a server-rendered route) and
// the detection code stays out of the initial client bundle too — it is
// fetched only once a real game is underway.
//
// Everything is fire-and-forget: a failure anywhere in here can slow
// nothing down and break nothing — the game page stays oblivious.
// =====================================================================

import { createClientOnlyFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { registerDeviceFingerprint, reportAntiCheatEvents } from "./anticheat.functions";
import type { ClientEventBatch } from "./types";

type Detector = InstanceType<(typeof import("./detector.client"))["AntiCheatDetector"]>;

let fingerprintSent = false;

async function transport(batch: ClientEventBatch): Promise<void> {
  await reportAntiCheatEvents({ data: batch });
}

/** Browser-only module loaders — no-ops during SSR. */
const loadDetector = createClientOnlyFn(async (): Promise<Detector> => {
  const { AntiCheatDetector } = await import("./detector.client");
  return new AntiCheatDetector(transport);
});

const loadFingerprint = createClientOnlyFn(async () => {
  const { getDeviceFingerprint } = await import("./fingerprint.client");
  return getDeviceFingerprint();
});

export interface AntiCheatMonitorInput {
  gameId: string;
  /** games.status — detection only runs while "active". */
  status: string | undefined;
  /** The local user's seat, or null for spectators. */
  myColor: "w" | "b" | null;
  /** Signed-in user id (detection requires an authenticated player). */
  userId: string | null | undefined;
  /** Total plies played — used to attribute opponent moves. */
  movesCount: number;
}

export interface AntiCheatMonitorHandle {
  /** Call at the instant the local player commits a move. */
  noteOwnMove: () => void;
  /** Call when the realtime channel drops or comes back. */
  noteConnection: (state: "dropped" | "restored") => void;
}

export function useAntiCheatMonitor(input: AntiCheatMonitorInput): AntiCheatMonitorHandle {
  const { gameId, status, myColor, userId, movesCount } = input;
  const detectorRef = useRef<Detector | null>(null);
  const prevMovesRef = useRef(movesCount);
  const endPingedRef = useRef(false);

  const isActivePlayer = !!userId && !!myColor && status === "active";

  // Detector lifecycle — bound to "I am a player in an active game".
  useEffect(() => {
    if (!isActivePlayer || typeof window === "undefined") return;
    let cancelled = false;
    void (async () => {
      try {
        const detector = detectorRef.current ?? (await loadDetector());
        if (cancelled || !detector) return;
        detectorRef.current = detector;
        detector.start();
        detector.setGame(gameId, true);
      } catch {
        /* detection is best-effort — the game must never notice */
      }
    })();
    return () => {
      cancelled = true;
      detectorRef.current?.stop();
    };
  }, [isActivePlayer, gameId]);

  // One fingerprint registration per browser session (first active game).
  useEffect(() => {
    if (!isActivePlayer || fingerprintSent || typeof window === "undefined") return;
    fingerprintSent = true;
    void (async () => {
      try {
        const fp = await loadFingerprint();
        if (!fp) return;
        await registerDeviceFingerprint({
          data: { hash: fp.hash, components: { ...fp.components } },
        });
      } catch {
        /* fingerprinting is best-effort */
      }
    })();
  }, [isActivePlayer]);

  // Opponent-move signal (drives reaction-time measurements).
  useEffect(() => {
    const prev = prevMovesRef.current;
    prevMovesRef.current = movesCount;
    if (!isActivePlayer || movesCount <= prev) return;
    const moverColor: "w" | "b" = movesCount % 2 === 1 ? "w" : "b";
    if (moverColor !== myColor) detectorRef.current?.noteOpponentMove();
  }, [movesCount, isActivePlayer, myColor]);

  // Game over → final flush + server ping so analysis runs for games that
  // ended outside the move handler (resign / draw / timeout claim).
  useEffect(() => {
    if (status !== "finished" || endPingedRef.current) return;
    if (!userId || !myColor) return;
    endPingedRef.current = true;
    void detectorRef.current?.flush();
    void reportAntiCheatEvents({
      data: { gameId, sessionId: `gameend-${gameId.slice(0, 8)}`, events: [] },
    }).catch(() => {});
  }, [status, userId, myColor, gameId]);

  const noteOwnMove = useCallback(() => {
    detectorRef.current?.noteOwnMoveCommitted();
  }, []);

  const noteConnection = useCallback((state: "dropped" | "restored") => {
    detectorRef.current?.noteConnection(state);
  }, []);

  // Stable handle — safe to list in consumer dependency arrays.
  return useMemo(() => ({ noteOwnMove, noteConnection }), [noteOwnMove, noteConnection]);
}
