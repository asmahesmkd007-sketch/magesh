import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Crown, Minus, X, ArrowLeft, Play, LineChart } from "lucide-react";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/site/UserAvatar";

export const Route = createFileRoute("/play/history")({
  head: () => ({ meta: [{ title: "Game History — ChessOx" }] }),
  component: GameHistory,
});

type GameRow = {
  id: string;
  white_username: string | null;
  black_username: string | null;
  white_id: string | null;
  black_id: string | null;
  white_rating: number | null;
  black_rating: number | null;
  result: string;
  time_control: string;
  time_class: string;
  moves_count: number;
  is_rated: boolean;
  created_at: string;
  ended_at: string | null;
  end_reason: string | null;
  status: string | null;
  opening: string | null;
};

const PAGE_SIZE = 25;

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fmtDuration(createdAt: string, endedAt: string): string {
  const secs = Math.round((new Date(endedAt).getTime() - new Date(createdAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function GameHistory() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [games, setGames] = useState<GameRow[]>([]);
  const [deltas, setDeltas] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<"all" | "win" | "loss" | "draw">("all");
  const limitRef = useRef(PAGE_SIZE);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchGames = (userId: string, limit: number) => {
    return Promise.all([
      supabase
        .from("games")
        .select(
          "id,white_username,black_username,white_id,black_id,white_rating,black_rating,result,time_control,time_class,moves_count,is_rated,created_at,ended_at,end_reason,status,opening",
        )
        .or(`white_id.eq.${userId},black_id.eq.${userId}`)
        .not("ended_at", "is", null)
        .in("result", ["white", "black", "draw"])
        .order("ended_at", { ascending: false })
        .limit(limit),
      supabase
        .from("rating_history" as never)
        .select("game_id,delta")
        .eq("user_id", userId)
        .limit(1000),
    ]).then(([g, rh]) => {
      const rows = (g.data ?? []) as GameRow[];
      setGames(rows);
      setHasMore(rows.length === limit);
      const map = new Map<string, number>();
      for (const r of (rh.data ?? []) as { game_id: string | null; delta: number }[]) {
        if (r.game_id != null) map.set(r.game_id, r.delta);
      }
      setDeltas(map);
      setLoading(false);
      setLoadingMore(false);
    });
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    limitRef.current = PAGE_SIZE;
    fetchGames(user.id, limitRef.current);

    channelRef.current = supabase
      .channel(`history:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `white_id=eq.${user.id}` },
        () => fetchGames(user.id, limitRef.current),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `black_id=eq.${user.id}` },
        () => fetchGames(user.id, limitRef.current),
      )
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  const loadMore = () => {
    if (!user) return;
    setLoadingMore(true);
    limitRef.current += PAGE_SIZE;
    fetchGames(user.id, limitRef.current);
  };

  if (!authLoading && !user) {
    return (
      <PageShell eyebrow="History" title="Game History">
        <Card className="p-8 text-center">
          <Crown className="mx-auto h-10 w-10 text-gold/40" />
          <p className="mt-4 text-muted-foreground">Sign in to view your match history.</p>
          <div className="mt-6">
            <Link to="/auth">
              <GoldButton>Sign in</GoldButton>
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  function getOutcome(g: GameRow): "win" | "loss" | "draw" | "ongoing" {
    if (!user) return "ongoing";
    if (g.result === "draw") return "draw";
    const iWasWhite = g.white_id === user.id;
    if (g.result === "white") return iWasWhite ? "win" : "loss";
    if (g.result === "black") return iWasWhite ? "loss" : "win";
    return "ongoing";
  }

  const filtered = games.filter((g) => {
    if (filter === "all") return true;
    return getOutcome(g) === filter;
  });

  const wins = games.filter((g) => getOutcome(g) === "win").length;
  const losses = games.filter((g) => getOutcome(g) === "loss").length;
  const draws = games.filter((g) => getOutcome(g) === "draw").length;

  const OutcomeIcon = ({ outcome }: { outcome: "win" | "loss" | "draw" | "ongoing" }) => {
    if (outcome === "win") return <Crown className="h-4 w-4 text-gold" />;
    if (outcome === "loss") return <X className="h-4 w-4 text-destructive" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <PageShell
      eyebrow="Royal Archives"
      title="Game History"
      subtitle="Every finished match, replayable and reviewable forever."
      action={
        <Link to="/play">
          <GoldButton>
            <ArrowLeft className="h-4 w-4" /> Back to Play
          </GoldButton>
        </Link>
      }
    >
      {/* Summary stats */}
      <div className="mb-8 grid grid-cols-3 gap-4 sm:grid-cols-3 lg:max-w-lg">
        {[
          { label: "Wins", val: wins, color: "text-gold" },
          { label: "Losses", val: losses, color: "text-destructive" },
          { label: "Draws", val: draws, color: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.label} className="p-4 text-center">
            <div className={`font-display text-3xl ${s.color}`}>{s.val}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(["all", "win", "loss", "draw"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-4 py-1.5 text-sm capitalize transition ${filter === f ? "border-gold bg-gold/10 text-gold" : "border-white/10 text-muted-foreground hover:border-gold/30"}`}
          >
            {f === "all"
              ? `All (${games.length})`
              : f === "win"
                ? `Wins (${wins})`
                : f === "loss"
                  ? `Losses (${losses})`
                  : `Draws (${draws})`}
          </button>
        ))}
      </div>

      {loading && (
        <div className="py-24 text-center text-muted-foreground">Loading your royal archives…</div>
      )}

      {!loading && filtered.length === 0 && (
        <Card className="p-10 text-center">
          <Crown className="mx-auto h-10 w-10 text-gold/30" />
          <p className="mt-4 text-muted-foreground">No games found. Play some matches first!</p>
          <div className="mt-6">
            <Link to="/play/friend">
              <GoldButton>Play a Friend</GoldButton>
            </Link>
          </div>
        </Card>
      )}

      {!loading && filtered.length > 0 && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3 text-left w-10">#</th>
                <th className="px-4 py-3 text-left">Result</th>
                <th className="px-4 py-3 text-left">Opponent</th>
                <th className="hidden px-4 py-3 text-left sm:table-cell">Color</th>
                <th className="hidden px-4 py-3 text-left lg:table-cell">Opening</th>
                <th className="hidden px-4 py-3 text-left sm:table-cell">Time</th>
                <th className="hidden px-4 py-3 text-left md:table-cell">Moves</th>
                <th className="hidden px-4 py-3 text-left md:table-cell">Δ</th>
                <th className="hidden px-4 py-3 text-left md:table-cell">Duration</th>
                <th className="hidden px-4 py-3 text-left lg:table-cell">End</th>
                <th className="px-4 py-3 text-left">When</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((g, i) => {
                const outcome = getOutcome(g);
                const iWasWhite = g.white_id === user?.id;
                const oppName = iWasWhite ? g.black_username : g.white_username;
                const myRating = iWasWhite ? g.white_rating : g.black_rating;
                const oppRating = iWasWhite ? g.black_rating : g.white_rating;
                const delta = deltas.get(g.id);
                return (
                  <tr
                    key={g.id}
                    className="border-b border-white/[0.04] transition hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <OutcomeIcon outcome={outcome} />
                        <span
                          className={
                            outcome === "win"
                              ? "text-gold capitalize"
                              : outcome === "loss"
                                ? "text-destructive capitalize"
                                : "capitalize text-muted-foreground"
                          }
                        >
                          {outcome}
                        </span>
                        {g.is_rated && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] bg-white/5 text-muted-foreground">
                            rated
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <UserAvatar displayName={oppName ?? "?"} size="sm" className="shrink-0" />
                        <div>
                          <div>{oppName ?? "—"}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {myRating ?? "—"} vs {oppRating ?? "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell text-muted-foreground text-xs">
                      {iWasWhite ? "♔ White" : "♚ Black"}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell text-muted-foreground text-xs">
                      {g.opening ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span className="capitalize">{g.time_class}</span>
                      <span className="ml-1 text-muted-foreground">({g.time_control})</span>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell text-muted-foreground">
                      {g.moves_count}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {delta == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={delta >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {delta >= 0 ? "+" : ""}
                          {delta}
                        </span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell text-muted-foreground">
                      {g.ended_at ? fmtDuration(g.created_at, g.ended_at) : "—"}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell text-muted-foreground capitalize">
                      {g.end_reason ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {relTime(g.ended_at ?? g.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          to="/game/$id/review"
                          params={{ id: g.id }}
                          className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs transition hover:border-gold/40 hover:text-gold"
                        >
                          <Play className="h-3 w-3" /> Replay
                        </Link>
                        <button
                          onClick={() => navigate({ to: "/analysis", search: { gameId: g.id } })}
                          className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs transition hover:border-gold/40 hover:text-gold"
                        >
                          <LineChart className="h-3 w-3" /> Analyze
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {!loading && hasMore && filter === "all" && (
        <div className="mt-6 text-center">
          <GhostButton onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </GhostButton>
        </div>
      )}
    </PageShell>
  );
}
