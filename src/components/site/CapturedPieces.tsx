import { useMemo } from "react";
import type { Color } from "chess.js";
import type { BoardCell } from "@/components/site/InteractiveBoard";
import { computeCaptured, SOLID_GLYPH } from "@/lib/chess/pieces";

type Props = {
  board: BoardCell[][];
  /** Which player's captures to show: pieces this colour has taken. */
  player: Color;
  className?: string;
};

/**
 * Shows the pieces a player has captured, next to their profile, with the
 * running material advantage. Derived from the live board so it updates the
 * instant a capture lands — and is identical for both players.
 */
export function CapturedPieces({ board, player, className = "" }: Props) {
  const { byWhite, byBlack, materialAdvantage } = useMemo(() => computeCaptured(board), [board]);

  const pieces = player === "w" ? byWhite : byBlack;
  // White shows captured BLACK pieces (dark), Black shows captured WHITE pieces.
  const glyphColor = player === "w" ? "b" : "w";
  const advantage = player === "w" ? materialAdvantage : -materialAdvantage;

  return (
    <div className={`flex min-h-[20px] flex-wrap items-center gap-0.5 ${className}`}>
      {pieces.map((type, i) => (
        <span
          key={i}
          className="select-none text-base leading-none"
          style={{
            color: glyphColor === "w" ? "#f5e7c1" : "#2a2a2a",
            WebkitTextStroke:
              glyphColor === "w" ? "0.03em rgba(0,0,0,0.6)" : "0.03em rgba(255,255,255,0.4)",
          }}
        >
          {SOLID_GLYPH[type]}
        </span>
      ))}
      {advantage > 0 && <span className="ml-1 text-xs font-medium text-gold/90">+{advantage}</span>}
    </div>
  );
}
