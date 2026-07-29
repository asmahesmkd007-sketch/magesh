// =====================================================================
// InsightsPanel — static features of the current position
// ---------------------------------------------------------------------
// Material, mobility, king safety, pawn structure, centre control,
// space, development and immediate threats — side by side for White
// and Black. Pure presentation over analyzePositionInsights, memoised
// per FEN.
// =====================================================================
import { useMemo } from "react";

import { analyzePositionInsights, type SideInsights } from "@/lib/analysis/positionInsights";

const RATING_STYLE: Record<SideInsights["kingSafety"]["rating"], string> = {
  safe: "text-emerald-400",
  wary: "text-yellow-400",
  exposed: "text-red-400",
};

function Row({
  label,
  white,
  black,
}: {
  label: string;
  white: React.ReactNode;
  black: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="w-16 text-right tabular-nums text-foreground">{white}</span>
      <span className="w-16 text-right tabular-nums text-foreground">{black}</span>
    </div>
  );
}

function pawnList(squares: string[]): string {
  if (squares.length === 0) return "—";
  return squares.slice(0, 4).join(" ") + (squares.length > 4 ? "…" : "");
}

export function InsightsPanel({ fen }: { fen: string }) {
  const insights = useMemo(() => analyzePositionInsights(fen), [fen]);
  const { white, black, threats, weakSquares } = insights;

  return (
    <section aria-label="Position details" className="text-sm">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-white/10 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span />
        <span className="w-16 text-right">White</span>
        <span className="w-16 text-right">Black</span>
      </div>

      <div className="divide-y divide-white/5">
        <Row label="Material" white={`${white.materialPawns}`} black={`${black.materialPawns}`} />
        <Row label="Mobility (moves)" white={white.mobility} black={black.mobility} />
        <Row
          label="King safety"
          white={
            <span className={RATING_STYLE[white.kingSafety.rating]}>{white.kingSafety.rating}</span>
          }
          black={
            <span className={RATING_STYLE[black.kingSafety.rating]}>{black.kingSafety.rating}</span>
          }
        />
        <Row label="Centre control" white={white.centerControl} black={black.centerControl} />
        <Row label="Space" white={white.space} black={black.space} />
        <Row
          label="Developed pieces"
          white={`${white.developed}/5`}
          black={`${black.developed}/5`}
        />
        <Row
          label="Castled"
          white={white.castled ? "yes" : "no"}
          black={black.castled ? "yes" : "no"}
        />
        <Row label="Pawn islands" white={white.pawns.islands} black={black.pawns.islands} />
      </div>

      {/* Pawn features (only rows with content) */}
      <div className="mt-2 space-y-1 text-[11px]">
        {(white.pawns.passed.length > 0 || black.pawns.passed.length > 0) && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Passed pawns</span>
            <span className="font-mono text-emerald-400">
              {pawnList(white.pawns.passed)} · {pawnList(black.pawns.passed)}
            </span>
          </div>
        )}
        {(white.pawns.isolated.length > 0 || black.pawns.isolated.length > 0) && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Isolated pawns</span>
            <span className="font-mono text-yellow-400">
              {pawnList(white.pawns.isolated)} · {pawnList(black.pawns.isolated)}
            </span>
          </div>
        )}
        {(white.pawns.doubled.length > 0 || black.pawns.doubled.length > 0) && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Doubled pawns</span>
            <span className="font-mono text-yellow-400">
              {pawnList(white.pawns.doubled)} · {pawnList(black.pawns.doubled)}
            </span>
          </div>
        )}
        {(white.pawns.backward.length > 0 || black.pawns.backward.length > 0) && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Backward pawns</span>
            <span className="font-mono text-orange-400">
              {pawnList(white.pawns.backward)} · {pawnList(black.pawns.backward)}
            </span>
          </div>
        )}
        {(weakSquares.white.length > 0 || weakSquares.black.length > 0) && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Weak squares</span>
            <span className="font-mono text-muted-foreground">
              {pawnList(weakSquares.white)} · {pawnList(weakSquares.black)}
            </span>
          </div>
        )}
      </div>

      {threats.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {insights.sideToMove === "w" ? "White" : "Black"} to move — ideas
          </div>
          <ul className="space-y-0.5 text-xs">
            {threats.map((t) => (
              <li key={t.san} className="flex items-center gap-2">
                <span className="font-mono text-gold">{t.san}</span>
                <span className="text-muted-foreground">{t.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
