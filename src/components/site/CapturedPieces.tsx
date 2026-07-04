import { useMemo } from "react";
import type { Color } from "chess.js";
import type { BoardCell } from "@/components/site/InteractiveBoard";
import { computeCaptured } from "@/lib/chess/pieces";
import { PieceGlyph } from "@/lib/chess/pieceThemes";
import { useGameSettings } from "@/hooks/useGameSettings";

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
  const { settings } = useGameSettings();
  const { byWhite, byBlack, materialAdvantage } = useMemo(() => computeCaptured(board), [board]);

  // Respect the board-display settings — hide entirely when captures are off.
  if (!settings.show_captured_pieces && !settings.show_material_difference) return null;

  const pieces = player === "w" ? byWhite : byBlack;
  // White shows captured BLACK pieces (dark), Black shows captured WHITE pieces.
  const glyphColor = player === "w" ? "b" : "w";
  const advantage = player === "w" ? materialAdvantage : -materialAdvantage;

  return (
    <div className={`flex min-h-[20px] flex-wrap items-center gap-0.5 ${className}`}>
      {settings.show_captured_pieces &&
        pieces.map((type, i) => (
          <span key={i} className="inline-block h-4 w-4 select-none">
            <PieceGlyph theme={settings.piece_theme} color={glyphColor} type={type} />
          </span>
        ))}
      {settings.show_material_difference && advantage > 0 && (
        <span className="ml-1 text-xs font-medium text-gold/90">+{advantage}</span>
      )}
    </div>
  );
}
