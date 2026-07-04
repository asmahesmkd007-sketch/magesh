import { memo } from "react";
import type { PieceSymbol } from "chess.js";
import type { PieceTheme } from "@/hooks/useBoardSettings";

const THEME_MAPPING: Record<PieceTheme, string> = {
  classic: "classic",
  neo: "neo",
  modern: "alpha",
  tournament: "bases",
  championship: "book",
  wooden: "wood",
  glass: "glass",
  marble: "marble",
  gold: "vintage",
  silver: "condal",
  carbon: "lolz",
  minimal: "tigers",
  gothic: "gothic",
  fantasy: "neon",
  professional: "club",
};

type GlyphProps = {
  theme: PieceTheme;
  color: "w" | "b";
  type: PieceSymbol;
  /** Optional explicit pixel size; defaults to filling the parent (100%). */
  size?: number | string;
  className?: string;
};

/**
 * Renders a single chess piece. 
 * Now uses distinct image assets for each theme to ensure the actual shape and style changes,
 * not just the color/gradient.
 */
export const PieceGlyph = memo(function PieceGlyph({
  theme,
  color,
  type,
  size,
  className,
}: GlyphProps) {
  const mappedTheme = THEME_MAPPING[theme] || "neo";
  const src = `https://images.chesscomfiles.com/chess-themes/pieces/${mappedTheme}/150/${color}${type}.png`;
  const dim = size ?? "100%";

  return (
    <img
      src={src}
      width={dim}
      height={dim}
      className={className}
      style={{ 
        display: "block", 
        filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.3))",
        objectFit: "contain"
      }}
      alt={`${color} ${type}`}
      draggable={false}
    />
  );
});

