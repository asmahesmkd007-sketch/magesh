// =====================================================================
// useSpectatorGame — the delayed live feed, plus replay controls
// ---------------------------------------------------------------------
// WHY POLLING AND NOT REALTIME
// Every other live surface in this app subscribes to postgres_changes on
// `games`. A spectator cannot: that channel carries the CURRENT fen, and
// the whole point of the delay is that non-players never receive it. So
// the feed is a poll of get_spectator_game(), which is the only thing
// that will hand a spectator a position at all — and hands out only the
// part that has cleared the embargo.
//
// The poll interval is irrelevant next to the delay it sits behind: a
// 2.5s poll on a 25s-delayed ranked feed adds at most 2.5s to a wait
// that is deliberately 25s long.
//
// The hook also owns the replay cursor. Live-follow and paused/scrubbed
// viewing are the same state machine: `cursor === null` means "show the
// newest ply the server has released", any number means "show that ply
// and stop moving". New plies keep arriving either way, so resuming
// jumps straight back to live rather than replaying the backlog.
// =====================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  SpectatorAccessError,
  fetchSpectatorGame,
  spectatorHeartbeat,
  spectatorLeave,
} from "@/lib/api/spectatorClient";
import type { SpectatorGame } from "@/lib/spectator/types";

/** How often to ask for a fresh snapshot while the game is running. */
const POLL_MS = 2_500;
/** Slower cadence while the tab is hidden — nobody is looking. */
const HIDDEN_POLL_MS = 15_000;
/** Must stay under spectator_config.session_ttl_seconds (45s). */
const HEARTBEAT_MS = 20_000;
/** Reconnect backoff after a failed poll: 2s, 4s, 8s … capped. */
const MAX_BACKOFF_MS = 30_000;

export type SpectatorControls = {
  /** Null = following the live (delayed) position. */
  cursor: number | null;
  /** True when the viewer has paused or scrubbed away from live. */
  paused: boolean;
  toLive: () => void;
  pause: () => void;
  first: () => void;
  previous: () => void;
  next: () => void;
  last: () => void;
  jumpTo: (ply: number) => void;
};

export type UseSpectatorGame = {
  game: SpectatorGame | null;
  /** The position being displayed — live tip or the scrubbed-to ply. */
  fen: string;
  /** Ply currently displayed (0 = starting position). */
  ply: number;
  /** The move that produced `fen`, for last-move highlighting. */
  lastMove: { from: string; to: string } | null;
  /** Plies released so far. The cursor can address 0…this. */
  available: number;
  loading: boolean;
  error: string | null;
  /** True when the players have closed this game to the viewer. */
  forbidden: boolean;
  viewers: number;
  controls: SpectatorControls;
};

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
/** Shared empty list, so "no moves yet" has a stable identity. */
const EMPTY_MOVES: SpectatorGame["moves"] = [];

export function useSpectatorGame(gameId: string, signedIn: boolean): UseSpectatorGame {
  const [game, setGame] = useState<SpectatorGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [viewers, setViewers] = useState(0);

  // Mirrors for async callbacks that must not close over a stale render.
  const cursorRef = useRef<number | null>(null);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  // ---- Poll loop ------------------------------------------------------
  useEffect(() => {
    if (!gameId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;

    const schedule = (ms: number) => {
      if (!alive) return;
      timer = setTimeout(run, ms);
    };

    const run = async () => {
      if (!alive) return;
      try {
        const next = await fetchSpectatorGame(gameId);
        if (!alive) return;
        failures = 0;
        setGame(next);
        setViewers(next.viewers);
        setError(null);
        setForbidden(false);
        setLoading(false);

        // A finished game has nothing left to stream; stop polling and
        // let the viewer scrub the completed game at their own pace.
        if (next.status === "finished") return;

        schedule(document.visibilityState === "hidden" ? HIDDEN_POLL_MS : POLL_MS);
      } catch (e) {
        if (!alive) return;
        setLoading(false);
        if (e instanceof SpectatorAccessError) {
          setForbidden(true);
          setError(e.message);
          return; // Not a transient failure — retrying will not help.
        }
        failures += 1;
        setError(e instanceof Error ? e.message : "Lost connection to the broadcast.");
        schedule(Math.min(2_000 * 2 ** (failures - 1), MAX_BACKOFF_MS));
      }
    };

    void run();

    // Coming back to the tab should feel instant, not "up to 15s stale".
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [gameId]);

  // ---- Audience presence ---------------------------------------------
  // Only signed-in viewers are counted, so the number on screen is a
  // count of accounts rather than of easily-forged sessions.
  useEffect(() => {
    if (!gameId || !signedIn || forbidden) return;
    let alive = true;

    const beat = async () => {
      try {
        const n = await spectatorHeartbeat(gameId);
        if (alive) setViewers(n);
      } catch {
        // A missed heartbeat only ages this viewer out of the count.
      }
    };
    void beat();
    const iv = setInterval(() => void beat(), HEARTBEAT_MS);

    return () => {
      alive = false;
      clearInterval(iv);
      void spectatorLeave(gameId).catch(() => {});
    };
  }, [gameId, signedIn, forbidden]);

  // ---- Derived view ---------------------------------------------------
  // Memoised so the empty-array fallback keeps a stable identity — a
  // fresh `[]` every render would invalidate everything downstream of it
  // on every poll tick.
  const moves = useMemo(() => game?.moves ?? EMPTY_MOVES, [game?.moves]);
  const available = moves.length;

  const ply = cursor === null ? available : Math.max(0, Math.min(cursor, available));

  const fen = ply === 0 ? START_FEN : (moves[ply - 1]?.fen_after ?? game?.fen ?? START_FEN);

  const lastMove = useMemo(() => {
    if (ply === 0) return null;
    const uci = moves[ply - 1]?.uci;
    if (!uci || uci.length < 4) return null;
    return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
  }, [moves, ply]);

  // ---- Controls -------------------------------------------------------
  const toLive = useCallback(() => setCursor(null), []);
  const pause = useCallback(() => {
    setCursor((c) => (c === null ? available : c));
  }, [available]);
  const first = useCallback(() => setCursor(0), []);
  const last = useCallback(() => setCursor(null), []);
  const previous = useCallback(() => {
    setCursor((c) => Math.max(0, (c === null ? available : c) - 1));
  }, [available]);
  const next = useCallback(() => {
    setCursor((c) => {
      const at = c === null ? available : c;
      // Stepping onto the newest ply means "caught up" — go back to
      // following live so the next release appears on its own.
      return at + 1 >= available ? null : at + 1;
    });
  }, [available]);
  const jumpTo = useCallback(
    (target: number) => setCursor(Math.max(0, Math.min(target, available))),
    [available],
  );

  const controls = useMemo<SpectatorControls>(
    () => ({
      cursor,
      paused: cursor !== null,
      toLive,
      pause,
      first,
      previous,
      next,
      last,
      jumpTo,
    }),
    [cursor, toLive, pause, first, previous, next, last, jumpTo],
  );

  return {
    game,
    fen,
    ply,
    lastMove,
    available,
    loading,
    error,
    forbidden,
    viewers,
    controls,
  };
}
