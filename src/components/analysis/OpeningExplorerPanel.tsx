// =====================================================================
// OpeningExplorerPanel — theory + database continuations
// ---------------------------------------------------------------------
// Two sources for the current position:
//   Theory   — named continuations from the built-in ECO book.
//   Games    — statistics from finished ChessOX games (opening_explorer
//              RPC), with personal / colour / time-class filters.
// Clicking a continuation plays it on the board.
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";

import { fetchExplorer, type ExplorerFilters } from "@/lib/api/openingExplorerClient";
import { bookContinuations } from "@/lib/chess/openings";
import type { OpeningMatch } from "@/lib/chess/openings";

type Props = {
  fen: string;
  /** Mainline SANs up to the current position (for book lookups). */
  sans: string[];
  opening: OpeningMatch | null;
  onPlaySan: (san: string) => void;
};

type SourceTab = "theory" | "games" | "mine";

const TIME_CLASSES = ["bullet", "blitz", "rapid", "classical"] as const;

function WinBar({ white, draws, black }: { white: number; draws: number; black: number }) {
  const total = Math.max(1, white + draws + black);
  const w = (white / total) * 100;
  const d = (draws / total) * 100;
  const b = (black / total) * 100;
  return (
    <div
      className="flex h-3.5 w-full overflow-hidden rounded-sm text-[8px] font-bold leading-[14px]"
      title={`White ${Math.round(w)}% · Draw ${Math.round(d)}% · Black ${Math.round(b)}%`}
    >
      <div style={{ width: `${w}%` }} className="bg-[#EFE6D5] text-center text-[#26150F]">
        {w >= 18 ? `${Math.round(w)}%` : ""}
      </div>
      <div style={{ width: `${d}%` }} className="bg-stone-500 text-center text-white">
        {d >= 18 ? `${Math.round(d)}%` : ""}
      </div>
      <div style={{ width: `${b}%` }} className="bg-[#26150F] text-center text-[#EFE6D5]">
        {b >= 18 ? `${Math.round(b)}%` : ""}
      </div>
    </div>
  );
}

export function OpeningExplorerPanel({ fen, sans, opening, onPlaySan }: Props) {
  const [source, setSource] = useState<SourceTab>("theory");
  const [timeClass, setTimeClass] = useState<(typeof TIME_CLASSES)[number] | null>(null);
  const [color, setColor] = useState<"w" | "b" | null>(null);

  const theory = source === "theory" ? bookContinuations(sans) : [];

  const filters: ExplorerFilters = {
    personal: source === "mine",
    color: source === "mine" && color ? color : undefined,
    timeClass: timeClass ?? undefined,
  };

  const gamesQuery = useQuery({
    queryKey: ["opening-explorer", fen, source, timeClass, color],
    queryFn: () => fetchExplorer(fen, filters),
    enabled: source !== "theory",
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return (
    <section aria-label="Opening explorer" className="space-y-2">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-gold" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          {opening ? (
            <div className="truncate text-sm">
              <span className="mr-1.5 rounded bg-gold/15 px-1.5 py-0.5 font-mono text-[10px] text-gold">
                {opening.eco}
              </span>
              {opening.name}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {sans.length === 0 ? "Starting position" : "Out of book"}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-1" role="tablist" aria-label="Explorer source">
        {(
          [
            ["theory", "Theory"],
            ["games", "ChessOX games"],
            ["mine", "My games"],
          ] as [SourceTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={source === id}
            onClick={() => setSource(id)}
            className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
              source === id ? "bg-gold/20 text-gold" : "text-muted-foreground hover:bg-white/5"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {source !== "theory" && (
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => setTimeClass(null)}
            className={`rounded px-1.5 py-0.5 ${timeClass === null ? "bg-gold/20 text-gold" : "bg-white/5 text-muted-foreground"}`}
          >
            all speeds
          </button>
          {TIME_CLASSES.map((tc) => (
            <button
              key={tc}
              type="button"
              onClick={() => setTimeClass((cur) => (cur === tc ? null : tc))}
              className={`rounded px-1.5 py-0.5 ${timeClass === tc ? "bg-gold/20 text-gold" : "bg-white/5 text-muted-foreground"}`}
            >
              {tc}
            </button>
          ))}
          {source === "mine" && (
            <>
              <span className="mx-1 h-3 w-px bg-white/10" />
              {(["w", "b"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor((cur) => (cur === c ? null : c))}
                  className={`rounded px-1.5 py-0.5 ${color === c ? "bg-gold/20 text-gold" : "bg-white/5 text-muted-foreground"}`}
                >
                  as {c === "w" ? "White" : "Black"}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Theory rows */}
      {source === "theory" &&
        (theory.length > 0 ? (
          <div className="space-y-1">
            {theory.map((c) => (
              <button
                key={c.san}
                type="button"
                onClick={() => onPlaySan(c.san)}
                className="flex w-full items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-left text-xs transition-colors hover:border-gold/25 hover:bg-gold/5"
              >
                <span className="w-12 shrink-0 font-mono text-gold">{c.san}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{c.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                  {c.eco}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            No book lines from here — you're on your own. The engine panel has you covered.
          </p>
        ))}

      {/* Database rows */}
      {source !== "theory" && (
        <>
          {gamesQuery.isLoading && (
            <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up games…
            </div>
          )}
          {gamesQuery.isError && (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              The games database is unreachable right now — try again in a moment.
            </p>
          )}
          {gamesQuery.data && gamesQuery.data.length === 0 && (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              {source === "mine"
                ? "None of your games reached this position yet."
                : "No ChessOX games reached this position yet."}
            </p>
          )}
          {gamesQuery.data && gamesQuery.data.length > 0 && (
            <div className="space-y-1">
              <div className="grid grid-cols-[3rem_2.5rem_1fr_3rem] gap-2 px-2.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Move</span>
                <span>Games</span>
                <span>Results</span>
                <span className="text-right">Avg elo</span>
              </div>
              {gamesQuery.data.map((row) => (
                <button
                  key={row.san}
                  type="button"
                  onClick={() => onPlaySan(row.san)}
                  className="grid w-full grid-cols-[3rem_2.5rem_1fr_3rem] items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-left text-xs transition-colors hover:border-gold/25 hover:bg-gold/5"
                >
                  <span className="font-mono text-gold">{row.san}</span>
                  <span className="tabular-nums text-muted-foreground">{row.games}</span>
                  <WinBar white={row.whiteWins} draws={row.draws} black={row.blackWins} />
                  <span className="text-right tabular-nums text-muted-foreground">
                    {row.avgRating ?? "—"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
