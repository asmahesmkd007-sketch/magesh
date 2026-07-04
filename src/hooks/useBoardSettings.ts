import { useGameSettings } from "@/hooks/useGameSettings";

/* ────────────────────────────────────────────────────────────────────────
 * BOARD THEMES (15+) — pure CSS gradients, zero external assets.
 * Switching is instant (no reload) and cached via localStorage; the selected
 * theme also syncs to profiles.board_theme so it follows the user across devices.
 * ──────────────────────────────────────────────────────────────────────── */
export type BoardTheme =
  | "royal"
  | "classic-green"
  | "walnut"
  | "wood-dark"
  | "wood-light"
  | "tournament-brown"
  | "ocean"
  | "midnight"
  | "marble-white"
  | "marble-black"
  | "emerald"
  | "crimson"
  | "sand"
  | "slate-gray"
  | "purple-royal"
  | "forest"
  | "ivory";

/* ────────────────────────────────────────────────────────────────────────
 * PIECE THEMES (15) — inline SVG vector sets (see src/lib/chess/pieceThemes.tsx).
 * Each set is a locally-authored vector "material"; nothing is fetched at runtime.
 * ──────────────────────────────────────────────────────────────────────── */
export type PieceTheme =
  | "classic"
  | "neo"
  | "modern"
  | "tournament"
  | "championship"
  | "wooden"
  | "glass"
  | "marble"
  | "gold"
  | "silver"
  | "carbon"
  | "minimal"
  | "gothic"
  | "fantasy"
  | "professional";

export type BoardSettings = {
  boardTheme: BoardTheme;
  pieceTheme: PieceTheme;
  soundEnabled: boolean;
  showCoords: boolean;
  autoFlip: boolean;
};

export const DEFAULT_SETTINGS: BoardSettings = {
  boardTheme: "royal",
  pieceTheme: "classic",
  soundEnabled: true,
  showCoords: true,
  autoFlip: false,
};

export type BoardSquareColors = {
  light: string;
  dark: string;
  /** Retained for legacy glyph rendering / captured-piece tint. */
  lightPiece: string;
  darkPiece: string;
};

export const BOARD_THEMES: Record<BoardTheme, BoardSquareColors> = {
  royal: {
    light: "linear-gradient(135deg,#ead6ac 0%,#cda05f 100%)",
    dark: "linear-gradient(135deg,#5c2e1f 0%,#2e120e 100%)",
    lightPiece: "#f5e7c1",
    darkPiece: "#16392e",
  },
  "classic-green": {
    light: "linear-gradient(135deg,#eeeed2 0%,#e6e6c8 100%)",
    dark: "linear-gradient(135deg,#7fa65b 0%,#6a8f4a 100%)",
    lightPiece: "#f8f8f0",
    darkPiece: "#3a4a26",
  },
  walnut: {
    light: "linear-gradient(135deg,#e4c9a0 0%,#d2ad7c 100%)",
    dark: "linear-gradient(135deg,#8a5a33 0%,#5f3a1c 100%)",
    lightPiece: "#f4e4cc",
    darkPiece: "#3a2410",
  },
  "wood-dark": {
    light: "linear-gradient(135deg,#c8a170 0%,#b0885a 100%)",
    dark: "linear-gradient(135deg,#4e3220 0%,#2f1c10 100%)",
    lightPiece: "#efd9b8",
    darkPiece: "#241206",
  },
  "wood-light": {
    light: "linear-gradient(135deg,#f0dcbc 0%,#e4c89e 100%)",
    dark: "linear-gradient(135deg,#b98a5a 0%,#9a6a3c 100%)",
    lightPiece: "#fbeed6",
    darkPiece: "#4a2f16",
  },
  "tournament-brown": {
    light: "linear-gradient(135deg,#e8d2ac 0%,#dcc294 100%)",
    dark: "linear-gradient(135deg,#9c6b42 0%,#7a4e2c 100%)",
    lightPiece: "#f6e8ce",
    darkPiece: "#3f2612",
  },
  ocean: {
    light: "linear-gradient(135deg,#bcd8f4 0%,#7cb2e0 100%)",
    dark: "linear-gradient(135deg,#0e3869 0%,#071d3b 100%)",
    lightPiece: "#e8f4ff",
    darkPiece: "#0a1e45",
  },
  midnight: {
    light: "linear-gradient(135deg,#8e8ea0 0%,#636373 100%)",
    dark: "linear-gradient(135deg,#26263a 0%,#12121e 100%)",
    lightPiece: "#e8e8f8",
    darkPiece: "#c0c0d8",
  },
  "marble-white": {
    light: "linear-gradient(135deg,#fbfbf7 0%,#ececdf 100%)",
    dark: "linear-gradient(135deg,#c2c0b4 0%,#a4a094 100%)",
    lightPiece: "#ffffff",
    darkPiece: "#4a463c",
  },
  "marble-black": {
    light: "linear-gradient(135deg,#8c8a86 0%,#6f6d68 100%)",
    dark: "linear-gradient(135deg,#2c2b28 0%,#171614 100%)",
    lightPiece: "#eceae4",
    darkPiece: "#0d0c0a",
  },
  emerald: {
    light: "linear-gradient(135deg,#d4ecd8 0%,#aad6b4 100%)",
    dark: "linear-gradient(135deg,#0f6b47 0%,#083d29 100%)",
    lightPiece: "#e9faee",
    darkPiece: "#052a1b",
  },
  crimson: {
    light: "linear-gradient(135deg,#f2d6cf 0%,#e4b3a8 100%)",
    dark: "linear-gradient(135deg,#8e2420 0%,#5c1512 100%)",
    lightPiece: "#fbe8e2",
    darkPiece: "#3a0c0a",
  },
  sand: {
    light: "linear-gradient(135deg,#f6eccf 0%,#eaddb0 100%)",
    dark: "linear-gradient(135deg,#caa661 0%,#a9843f 100%)",
    lightPiece: "#fdf6e0",
    darkPiece: "#5a4116",
  },
  "slate-gray": {
    light: "linear-gradient(135deg,#d8dce0 0%,#bcc2c8 100%)",
    dark: "linear-gradient(135deg,#54606b 0%,#39424b 100%)",
    lightPiece: "#eef1f4",
    darkPiece: "#1e252b",
  },
  "purple-royal": {
    light: "linear-gradient(135deg,#e5d8f0 0%,#c9b2e2 100%)",
    dark: "linear-gradient(135deg,#5a3391 0%,#361c5c 100%)",
    lightPiece: "#f3ecff",
    darkPiece: "#22103f",
  },
  forest: {
    light: "linear-gradient(135deg,#d4e8b4 0%,#99c066 100%)",
    dark: "linear-gradient(135deg,#2e5517 0%,#18320a 100%)",
    lightPiece: "#eef7e2",
    darkPiece: "#1a3a0c",
  },
  ivory: {
    light: "linear-gradient(135deg,#f5f0e6 0%,#e0d0b0 100%)",
    dark: "linear-gradient(135deg,#9b7320 0%,#5e4000 100%)",
    lightPiece: "#fffaf0",
    darkPiece: "#2a1800",
  },
};

export const BOARD_THEME_LABELS: Record<BoardTheme, string> = {
  royal: "Golden ChessOX",
  "classic-green": "Classic Green",
  walnut: "Walnut",
  "wood-dark": "Wood Dark",
  "wood-light": "Wood Light",
  "tournament-brown": "Tournament Brown",
  ocean: "Blue Ocean",
  midnight: "Midnight",
  "marble-white": "Marble White",
  "marble-black": "Marble Black",
  emerald: "Emerald",
  crimson: "Crimson",
  sand: "Sand",
  "slate-gray": "Slate Gray",
  "purple-royal": "Purple Royal",
  forest: "Forest",
  ivory: "Ivory",
};

export const PIECE_THEME_LABELS: Record<PieceTheme, string> = {
  classic: "Classic",
  neo: "Neo Classic",
  modern: "Modern",
  tournament: "Tournament",
  championship: "Championship",
  wooden: "Wooden",
  glass: "Glass",
  marble: "Marble",
  gold: "Gold",
  silver: "Silver",
  carbon: "Carbon",
  minimal: "Minimal",
  gothic: "Gothic",
  fantasy: "Fantasy",
  professional: "Professional",
};

export const BOARD_THEME_ORDER = Object.keys(BOARD_THEMES) as BoardTheme[];
export const PIECE_THEME_ORDER = Object.keys(PIECE_THEME_LABELS) as PieceTheme[];

/**
 * Backward-compatible board-settings adapter over the unified game-settings store
 * (see `useGameSettings` / `src/lib/settings/schema.ts`). Existing board/theme
 * consumers keep their `{ boardTheme, pieceTheme, soundEnabled, showCoords,
 * autoFlip }` shape while the values live in the single source of truth.
 */
export function useBoardSettings() {
  const { settings: g, update } = useGameSettings();

  const settings: BoardSettings = {
    boardTheme: g.board_theme,
    pieceTheme: g.piece_theme,
    soundEnabled: g.sound_master,
    showCoords: g.show_coordinates,
    autoFlip: g.auto_flip,
  };

  const updateSettings = (patch: Partial<BoardSettings>) => {
    update({
      ...(patch.boardTheme !== undefined ? { board_theme: patch.boardTheme } : {}),
      ...(patch.pieceTheme !== undefined ? { piece_theme: patch.pieceTheme } : {}),
      ...(patch.soundEnabled !== undefined ? { sound_master: patch.soundEnabled } : {}),
      ...(patch.showCoords !== undefined ? { show_coordinates: patch.showCoords } : {}),
      ...(patch.autoFlip !== undefined ? { auto_flip: patch.autoFlip } : {}),
    });
  };

  return { settings, updateSettings };
}
