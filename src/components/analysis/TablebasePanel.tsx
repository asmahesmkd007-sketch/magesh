// =====================================================================
// TablebasePanel — exact endgame verdicts from Syzygy tables
// ---------------------------------------------------------------------
// Shows once the position is down to ≤ 7 pieces: the objective result
// for the side to move, distance-to-zeroing/mate, and the ranked
// perfect-play move list. The probe is a network call (Lichess public
// tablebase) — offline it degrades to a quiet notice.
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import { Database, Loader2 } from "lucide-react";

import {
  probeTablebase,
  tablebaseEligible,
  type TablebaseCategory,
} from "@/lib/api/tablebaseClient";

type Props = {
  fen: string;
  onPlaySan: (san: string) => void;
};

/** Verdict for the player about to move, given a category. */
const VERDICT: Record<TablebaseCategory, { text: string; cls: string }> = {
  win: { text: "Winning", cls: "text-emerald-400" },
  "cursed-win": { text: "Winning (50-move rule draws it)", cls: "text-emerald-400/70" },
  draw: { text: "Draw", cls: "text-stone-300" },
  "blessed-loss": { text: "Losing (50-move rule saves it)", cls: "text-red-400/70" },
  loss: { text: "Losing", cls: "text-red-400" },
  unknown: { text: "Unknown", cls: "text-muted-foreground" },
};

/** A move's quality for the mover: the API reports the OPPONENT's fate. */
function moveVerdict(category: TablebaseCategory): { text: string; cls: string } {
  switch (category) {
    case "loss":
      return { text: "wins", cls: "text-emerald-400" };
    case "blessed-loss":
      return { text: "wins*", cls: "text-emerald-400/70" };
    case "draw":
      return { text: "draws", cls: "text-stone-300" };
    case "cursed-win":
      return { text: "loses*", cls: "text-red-400/70" };
    case "win":
      return { text: "loses", cls: "text-red-400" };
    default:
      return { text: "?", cls: "text-muted-foreground" };
  }
}

export function TablebasePanel({ fen, onPlaySan }: Props) {
  const eligible = tablebaseEligible(fen);

  const query = useQuery({
    queryKey: ["tablebase", fen.split(" ").slice(0, 4).join(" ")],
    queryFn: () => probeTablebase(fen),
    enabled: eligible,
    staleTime: Infinity,
    retry: 1,
  });

  if (!eligible) {
    return (
      <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <Database className="h-3.5 w-3.5" aria-hidden="true" />
        Tablebases cover positions with 7 pieces or fewer.
      </p>
    );
  }

  if (query.isLoading) {
    return (
      <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Probing Syzygy tables…
      </p>
    );
  }

  if (query.isError || !query.data) {
    return (
      <p className="px-1 text-xs text-muted-foreground">
        Tablebase unavailable (offline?) — engine analysis still applies.
      </p>
    );
  }

  const tb = query.data;
  const verdict = VERDICT[tb.category];
  const turn = fen.split(" ")[1] === "b" ? "Black" : "White";

  return (
    <section aria-label="Endgame tablebase" className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm">
          <Database className="h-4 w-4 text-gold" aria-hidden="true" />
          Syzygy verdict
        </span>
        <span className={`text-sm font-semibold ${verdict.cls}`}>
          {tb.checkmate ? "Checkmate" : tb.stalemate ? "Stalemate" : `${turn}: ${verdict.text}`}
        </span>
      </div>
      {(tb.dtm !== null || tb.dtz !== null) && (
        <p className="text-[11px] text-muted-foreground">
          {tb.dtm !== null && `Mate in ${Math.abs(tb.dtm)} · `}
          {tb.dtz !== null && `DTZ ${Math.abs(tb.dtz)}`}
        </p>
      )}
      {tb.moves.length > 0 && (
        <div className="space-y-1">
          {tb.moves.slice(0, 6).map((m) => {
            const mv = moveVerdict(m.category);
            return (
              <button
                key={m.uci}
                type="button"
                onClick={() => onPlaySan(m.san)}
                className="flex w-full items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-left text-xs transition-colors hover:border-gold/25 hover:bg-gold/5"
              >
                <span className="w-14 shrink-0 font-mono text-gold">{m.san}</span>
                <span className={`w-12 shrink-0 font-medium ${mv.cls}`}>{mv.text}</span>
                <span className="min-w-0 flex-1 truncate text-right tabular-nums text-[10px] text-muted-foreground/70">
                  {m.checkmate
                    ? "checkmate"
                    : m.dtm !== null
                      ? `DTM ${Math.abs(m.dtm)}`
                      : m.dtz !== null
                        ? `DTZ ${Math.abs(m.dtz)}`
                        : ""}
                </span>
              </button>
            );
          })}
          <p className="text-right text-[9px] text-muted-foreground/50">
            * affected by the 50-move rule
          </p>
        </div>
      )}
    </section>
  );
}
