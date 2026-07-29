// =====================================================================
// EvalBar — vertical advantage gauge alongside the board
// ---------------------------------------------------------------------
// Maps the current evaluation to a fill split (sigmoid-scaled so the
// interesting ±3 pawn region uses most of the travel), respects board
// orientation, and shows a mate countdown when one is forced.
// =====================================================================
import { winProbability } from "@/lib/analysis/accuracy";

type Props = {
  /** White-perspective folded centipawns (mate = ±100000 − distance). */
  cpWhite: number | null;
  /** Moves to mate (White positive), when forced. */
  mateIn: number | null;
  orientation: "w" | "b";
  /** Dim the bar when the engine is off/still waking up. */
  active: boolean;
};

function label(cpWhite: number, mateIn: number | null): string {
  if (mateIn !== null) return mateIn === 0 ? "#" : `M${Math.abs(mateIn)}`;
  const pawns = Math.abs(cpWhite) / 100;
  return pawns >= 10 ? pawns.toFixed(0) : pawns.toFixed(1);
}

export function EvalBar({ cpWhite, mateIn, orientation, active }: Props) {
  const cp = cpWhite ?? 0;
  const whitePct = winProbability(cp);
  // White's share grows from White's edge of the board (bottom in the
  // default orientation, top when flipped).
  const whiteAtBottom = orientation === "w";
  const labelText = label(cp, mateIn);
  const whiteLeads = cp >= 0;
  // The label sits inside the leading side's fill, in that fill's
  // contrasting ink.
  const labelAtBottom = whiteLeads === whiteAtBottom;

  return (
    <div
      className={`relative hidden w-5 self-stretch overflow-hidden rounded-full border border-gold/25 sm:flex ${active ? "" : "opacity-40"}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(whitePct)}
      aria-label={`Evaluation: ${whiteLeads ? "White" : "Black"} ${labelText}`}
    >
      {/* Black share fills the track; White's share overlays from its edge. */}
      <div className="absolute inset-0 bg-[#26150F]" />
      <div
        className={`absolute inset-x-0 bg-[#EFE6D5] transition-[height] duration-500 ease-out ${
          whiteAtBottom ? "bottom-0" : "top-0"
        }`}
        style={{ height: `${whitePct}%` }}
      />
      {/* Midline tick */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-gold/40" />
      <div
        className={`absolute inset-x-0 text-center font-mono text-[9px] font-bold leading-none ${
          labelAtBottom ? "bottom-1" : "top-1"
        } ${whiteLeads ? "text-[#26150F]" : "text-[#EFE6D5]"}`}
      >
        {labelText}
      </div>
    </div>
  );
}
