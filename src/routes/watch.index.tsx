// =====================================================================
// /watch — live match browser
// ---------------------------------------------------------------------
// The lobby for spectators: every in-progress game the viewer is allowed
// to watch, with the featured ones surfaced first.
//
// This page is safe to serve to anyone, including signed-out visitors,
// because list_live_games() reads a position-free view — there is no
// board state anywhere on it to leak.
// =====================================================================
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Card, PageShell } from "@/components/site/Primitives";
import { LiveMatchCard } from "@/components/spectator/LiveMatchCard";
import { useLiveGames } from "@/hooks/useLiveGames";
import { TIME_CLASS_LABEL } from "@/lib/spectator/delay";
import type { LiveGameSort, TimeClass } from "@/lib/spectator/types";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/watch/")({
  head: () =>
    seo({
      title: "Watch Live Chess Games — ChessOx",
      description:
        "Watch live chess games on ChessOx: ranked matches, tournament rounds and featured " +
        "grandmaster games, streamed with a fair-play broadcast delay.",
      keywords: [
        "watch chess live",
        "live chess games",
        "chess spectator mode",
        "live chess broadcast",
        "watch chess tournaments online",
      ],
      path: "/watch",
    }),
  component: WatchIndex,
});

const TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "classical"];

const SORTS: { value: LiveGameSort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "viewers", label: "Most watched" },
  { value: "rating", label: "Highest rated" },
  { value: "recent", label: "Just started" },
];

function WatchIndex() {
  const [timeClass, setTimeClass] = useState<TimeClass | null>(null);
  const [ratedOnly, setRatedOnly] = useState(false);
  const [sort, setSort] = useState<LiveGameSort>("featured");

  const filters = useMemo(
    () => ({ timeClass, ratedOnly, sort, limit: 48 }),
    [timeClass, ratedOnly, sort],
  );
  const { games, loading, error } = useLiveGames(filters);

  const featured = games.filter((g) => g.featured);
  const rest = games.filter((g) => !g.featured);
  const totalViewers = games.reduce((n, g) => n + g.viewers, 0);

  return (
    <PageShell
      eyebrow="Spectator Mode"
      title="Watch Live"
      subtitle="Follow ranked ladders, tournament rounds and featured matches as they happen."
      action={
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Radio className="h-3.5 w-3.5 animate-pulse text-destructive" aria-hidden />
          <span className="font-stat text-foreground">{games.length}</span> live
          <span aria-hidden>·</span>
          <span className="font-stat text-foreground">{totalViewers.toLocaleString()}</span>{" "}
          watching
        </div>
      }
    >
      {/* Why the boards look behind — said once, up front, so nobody
          reads the delay as lag. */}
      <Card className="mb-6 flex flex-wrap items-center gap-3 border-gold/20 p-4">
        <ShieldCheck className="h-4 w-4 shrink-0 text-gold" aria-hidden />
        <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
          Ranked broadcasts run 20–30 seconds behind the players, and tournament finals up to a
          minute, so that no spectator can feed a running game to an engine. Casual games are
          near-live. Players always see their own board in real time.
        </p>
      </Card>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <FilterChip active={timeClass === null} onClick={() => setTimeClass(null)}>
          All formats
        </FilterChip>
        {TIME_CLASSES.map((tc) => (
          <FilterChip key={tc} active={timeClass === tc} onClick={() => setTimeClass(tc)}>
            {TIME_CLASS_LABEL[tc]}
          </FilterChip>
        ))}
        <FilterChip active={ratedOnly} onClick={() => setRatedOnly((v) => !v)}>
          Ranked only
        </FilterChip>

        <div className="ml-auto flex items-center gap-2">
          <label
            htmlFor="watch-sort"
            className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
          >
            Sort
          </label>
          <select
            id="watch-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as LiveGameSort)}
            className="rounded-lg border border-gold/20 bg-white/[0.03] px-3 py-1.5 text-xs text-foreground outline-none focus:border-gold/40"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value} className="bg-charcoal">
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && games.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Finding live games…
        </div>
      ) : error ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">{error}</Card>
      ) : games.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="text-sm text-foreground">No games are live right now.</div>
          <p className="mt-2 text-xs text-muted-foreground">
            Matches appear here the moment they start — or start one yourself and let others watch.
          </p>
        </Card>
      ) : (
        <>
          {featured.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-4 flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-gold/80">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Featured
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {featured.map((g) => (
                  <LiveMatchCard key={g.id} game={g} />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              {featured.length > 0 && (
                <h2 className="mb-4 text-sm uppercase tracking-[0.2em] text-muted-foreground">
                  All live games
                </h2>
              )}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {rest.map((g) => (
                  <LiveMatchCard key={g.id} game={g} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </PageShell>
  );
}

function FilterChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
        active
          ? "border-gold/40 bg-gold/10 text-gold"
          : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-gold/25 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
