import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  getTournamentState,
  type CaptureRow,
  type TournamentActivityItem,
  type TournamentMatch,
  type TournamentState,
} from "@/lib/api/tournamentClient";

export type TournamentConnection = "connecting" | "live" | "reconnecting" | "offline";

// =====================================================================
// useTournament — the TR page's realtime state machine.
// ---------------------------------------------------------------------
// • One RPC (get_tournament_state) loads everything in a single trip.
// • One channel carries postgres_changes for all four tournament tables
//   plus presence (who is watching the page right now).
// • A second, rebuilt-on-demand channel follows the games of the active
//   round so clocks/boards/move counts tick without polling.
// • Table events coalesce into one debounced reload; activity inserts
//   and game updates are merged in place (no refetch storm).
// • Survives refresh (state is server-side), tab sleep (refetch on
//   visibilitychange/online) and socket drops (exponential backoff
//   resubscribe; refetch on every regained SUBSCRIBED).
// =====================================================================
export function useTournament(
  tournamentId: string,
  userId: string | null | undefined,
  onActivity?: (item: TournamentActivityItem) => void,
  onCapture?: (item: CaptureRow) => void,
) {
  const [state, setState] = useState<TournamentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<TournamentConnection>("connecting");
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  // server_now minus local clock at load time; countdowns add this back.
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;
  const backoffRef = useRef(1000);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);

  const load = useCallback(async () => {
    try {
      const s = await getTournamentState(tournamentId);
      if (disposed.current) return;
      if (!s) {
        setState(null);
        setError(null);
        setLoading(false);
        return;
      }
      setClockOffsetMs(new Date(s.server_now).getTime() - Date.now());
      setState(s);
      setError(null);
      setLoading(false);
    } catch (err) {
      if (disposed.current) return;
      setError(err instanceof Error ? err.message : "Failed to load tournament");
      setLoading(false);
    }
  }, [tournamentId]);

  // Coalesce bursts of table events (a finished round emits dozens) into
  // one state reload.
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) return;
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      void load();
    }, 250);
  }, [load]);

  // ---- Main channel: tournament tables + presence --------------------
  useEffect(() => {
    disposed.current = false;
    setLoading(true);
    setConnection("connecting");
    void load();

    let channel: RealtimeChannel | null = null;

    const subscribe = () => {
      if (disposed.current) return;
      channel = supabase.channel(`tournament:${tournamentId}`, {
        config: { presence: { key: userId ?? `anon-${Math.random().toString(36).slice(2)}` } },
      });

      channel
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "tournaments",
            filter: `id=eq.${tournamentId}`,
          } as never,
          scheduleReload,
        )
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "tournament_entries",
            filter: `tournament_id=eq.${tournamentId}`,
          } as never,
          scheduleReload,
        )
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "tournament_matches",
            filter: `tournament_id=eq.${tournamentId}`,
          } as never,
          scheduleReload,
        )
        .on(
          "postgres_changes" as never,
          {
            event: "INSERT",
            schema: "public",
            table: "tournament_activity",
            filter: `tournament_id=eq.${tournamentId}`,
          } as never,
          (payload: { new: TournamentActivityItem }) => {
            const item = payload.new;
            if (!item) return;
            setState((prev) =>
              prev && !prev.activity.some((a) => a.id === item.id)
                ? { ...prev, activity: [item, ...prev.activity].slice(0, 60) }
                : prev,
            );
            onActivityRef.current?.(item);
          },
        )
        .on(
          "postgres_changes" as never,
          {
            event: "INSERT",
            schema: "public",
            table: "tournament_captured_pieces",
            filter: `tournament_id=eq.${tournamentId}`,
          } as never,
          (payload: { new: CaptureRow }) => {
            const item = payload.new;
            if (!item) return;
            setState((prev) => {
              if (!prev) return prev;
              const existing = prev.captures ?? [];
              if (existing.some((c) => c.id === item.id)) return prev;
              return { ...prev, captures: [item, ...existing].slice(0, 60) };
            });
            onCaptureRef.current?.(item);
            // The capturer's score changed too; entries UPDATE will also fire,
            // but coalesce a reload in case that event is missed.
            scheduleReload();
          },
        )
        .on("presence", { event: "sync" }, () => {
          const presence = channel?.presenceState() ?? {};
          const ids = new Set<string>();
          for (const key of Object.keys(presence)) {
            if (!key.startsWith("anon-")) ids.add(key);
          }
          setOnlineIds(ids);
        })
        .subscribe((status) => {
          if (disposed.current) return;
          if (status === "SUBSCRIBED") {
            backoffRef.current = 1000;
            setConnection("live");
            // Catch up on anything missed while the socket was down.
            void load();
            if (userId) void channel?.track({ user_id: userId, at: Date.now() });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setConnection(navigator.onLine ? "reconnecting" : "offline");
            const ch = channel;
            channel = null;
            if (ch) void supabase.removeChannel(ch);
            if (retryTimer.current) clearTimeout(retryTimer.current);
            retryTimer.current = setTimeout(subscribe, backoffRef.current);
            backoffRef.current = Math.min(backoffRef.current * 2, 15000);
          }
        });
    };

    subscribe();

    const onWake = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onOnline = () => {
      setConnection("reconnecting");
      void load();
    };
    const onOffline = () => setConnection("offline");
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      disposed.current = true;
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      reloadTimer.current = null;
      retryTimer.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [tournamentId, userId, load, scheduleReload]);

  // ---- Games channel: live clocks/boards for the active round --------
  const activeGameIds = useMemo(
    () =>
      (state?.matches ?? [])
        .filter((m) => m.status === "active" && m.game_id && m.game_status === "active")
        .map((m) => m.game_id as string)
        .sort()
        .join(","),
    [state?.matches],
  );

  useEffect(() => {
    if (!activeGameIds) return;
    const channel = supabase.channel(`tournament_games:${tournamentId}`).on(
      "postgres_changes" as never,
      {
        event: "UPDATE",
        schema: "public",
        table: "games",
        filter: `id=in.(${activeGameIds})`,
      } as never,
      (payload: { new: Record<string, unknown> }) => {
        const g = payload.new;
        if (!g?.id) return;
        setState((prev) => {
          if (!prev) return prev;
          let changed = false;
          const matches = prev.matches.map((m): TournamentMatch => {
            if (m.game_id !== g.id) return m;
            changed = true;
            return {
              ...m,
              game_status: (g.status as string) ?? m.game_status,
              game_result: (g.result as string) ?? m.game_result,
              fen: (g.fen as string) ?? m.fen,
              turn: (g.turn as "w" | "b") ?? m.turn,
              moves_count: (g.moves_count as number) ?? m.moves_count,
              white_time_ms: (g.white_time_ms as number) ?? m.white_time_ms,
              black_time_ms: (g.black_time_ms as number) ?? m.black_time_ms,
              last_move_at: (g.last_move_at as string) ?? m.last_move_at,
              end_reason: (g.end_reason as string) ?? m.end_reason,
              game_ended_at: (g.ended_at as string) ?? m.game_ended_at,
            };
          });
          return changed ? { ...prev, matches } : prev;
        });
      },
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tournamentId, activeGameIds]);

  return { state, loading, error, connection, onlineIds, clockOffsetMs, refetch: load };
}
