// =====================================================================
// useLiveGames — the /watch browse feed
// ---------------------------------------------------------------------
// Lists in-progress matches the viewer is allowed to watch. The rows
// carry no position (list_live_games() reads the position-free
// live_games view), so this list is safe to refresh often and to render
// for signed-out visitors.
//
// Refresh is a slow poll rather than a subscription: the lobby changes
// on the scale of games starting and finishing, not moves, and one
// query every 10s costs far less than a realtime channel per visitor
// when thousands are browsing at once.
// =====================================================================
import { useCallback, useEffect, useRef, useState } from "react";

import { listLiveGames, type LiveGameFilters } from "@/lib/api/spectatorClient";
import type { LiveMatchSummary } from "@/lib/spectator/types";

const REFRESH_MS = 10_000;
const HIDDEN_REFRESH_MS = 60_000;

export type UseLiveGames = {
  games: LiveMatchSummary[];
  loading: boolean;
  error: string | null;
  /** Force an immediate refresh (filter change, manual retry). */
  refresh: () => void;
};

export function useLiveGames(filters: LiveGameFilters): UseLiveGames {
  const [games, setGames] = useState<LiveMatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Serialise the filters so the effect re-runs on a value change rather
  // than on every new object identity from the parent's render.
  const key = JSON.stringify([
    filters.limit,
    filters.offset,
    filters.timeClass,
    filters.ratedOnly,
    filters.sort,
  ]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      try {
        const rows = await listLiveGames(filtersRef.current);
        if (!alive) return;
        setGames(rows ?? []);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Could not load live games.");
      } finally {
        if (alive) setLoading(false);
      }
      if (!alive) return;
      timer = setTimeout(
        () => void run(),
        document.visibilityState === "hidden" ? HIDDEN_REFRESH_MS : REFRESH_MS,
      );
    };

    setLoading(true);
    void run();

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
  }, [key, nonce]);

  return { games, loading, error, refresh };
}
