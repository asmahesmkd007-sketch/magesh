// =====================================================================
// useRejoinableGame — "do I have a game to come back to?"
// ---------------------------------------------------------------------
// One server lookup per authenticated identity, performed after the
// session is restored. Deliberately NOT a poll and not a subscription:
// the answer only changes when the user starts or finishes a game, and
// both of those already take the user to (or away from) a board.
//
// Nothing here is read from localStorage, sessionStorage or a cached
// board. The dismissal set is the single piece of client state, and it is
// in-memory only — it holds "not right now", which is why a later visit
// (a fresh page load) offers the rejoin again while the game is still
// rejoinable.
// =====================================================================
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { fetchActiveGamesServerFn } from "@/lib/api/rejoin.functions";
import type { RejoinableGame } from "@/lib/rejoin/eligibility";

/**
 * Games the user chose not to resume in this page load. Module-scoped so
 * a dismissal survives the prompt unmounting and remounting during
 * ordinary navigation, and dies with the page — which is exactly the
 * lifetime "I don't want to rejoin right now" should have.
 */
const dismissed = new Set<string>();

/** Test seam — the prompt has no other mutable global state. */
export function __resetDismissals(): void {
  dismissed.clear();
}

export type RejoinableGamesState = {
  games: RejoinableGame[];
  loading: boolean;
  /** Drop one game from this page load's prompt. Never touches the game. */
  dismiss: (gameId: string) => void;
  /** Re-ask the server. Used after a rejoin resolves the prompt. */
  refresh: () => void;
};

export function useRejoinableGame(enabled = true): RejoinableGamesState {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [games, setGames] = useState<RejoinableGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  // Guards a second lookup for an identity already looked up: several
  // consumers may mount the hook, and React 19 double-invokes effects in
  // development.
  const lookedUpFor = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || authLoading) return;
    if (!userId) {
      lookedUpFor.current = null;
      setGames([]);
      return;
    }
    const key = `${userId}:${nonce}`;
    if (lookedUpFor.current === key) return;
    lookedUpFor.current = key;

    let alive = true;
    setLoading(true);
    fetchActiveGamesServerFn()
      .then((res) => {
        if (!alive) return;
        setGames(res.games);
      })
      .catch(() => {
        // Never block the app on this — no rejoin offer is the safe answer.
        if (alive) setGames([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [enabled, authLoading, userId, nonce]);

  const dismiss = useCallback((gameId: string) => {
    dismissed.add(gameId);
    // Re-render by dropping it from the rendered list; the game itself is
    // untouched and the server still governs it.
    setGames((prev) => prev.filter((g) => g.gameId !== gameId));
  }, []);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return {
    games: games.filter((g) => !dismissed.has(g.gameId)),
    loading,
    dismiss,
    refresh,
  };
}
