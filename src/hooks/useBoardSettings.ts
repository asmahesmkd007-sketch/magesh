import { useCallback, useEffect, useState } from "react";

export type BoardTheme = "royal" | "forest" | "ocean" | "midnight" | "ivory";
export type PieceTheme = "unicode" | "classic" | "outlined";

export type BoardSettings = {
  boardTheme: BoardTheme;
  pieceTheme: PieceTheme;
  soundEnabled: boolean;
  showCoords: boolean;
  autoFlip: boolean;
};

const DEFAULTS: BoardSettings = {
  boardTheme: "royal",
  pieceTheme: "unicode",
  soundEnabled: true,
  showCoords: true,
  autoFlip: false,
};

const KEY = "chessox:boardSettings";

function load(): BoardSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function useBoardSettings() {
  const [settings, setSettingsState] = useState<BoardSettings>(load);

  useEffect(() => {
    const handler = () => setSettingsState(load());
    window.addEventListener("chessox:settingschange", handler);
    return () => window.removeEventListener("chessox:settingschange", handler);
  }, []);

  const updateSettings = useCallback((patch: Partial<BoardSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("chessox:settingschange"));
      return next;
    });
  }, []);

  return { settings, updateSettings };
}

export type BoardSquareColors = {
  light: string;
  dark: string;
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
  forest: {
    light: "linear-gradient(135deg,#d4e8b4 0%,#99c066 100%)",
    dark: "linear-gradient(135deg,#2e5517 0%,#18320a 100%)",
    lightPiece: "#eef7e2",
    darkPiece: "#1a3a0c",
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
  ivory: {
    light: "linear-gradient(135deg,#f5f0e6 0%,#e0d0b0 100%)",
    dark: "linear-gradient(135deg,#9b7320 0%,#5e4000 100%)",
    lightPiece: "#fffaf0",
    darkPiece: "#2a1800",
  },
};

// NOTE: White pieces intentionally use the SOLID black glyphs (U+265A–F) rather
// than the hollow/outline glyphs (U+2654–9). The outline codepoints render as
// empty boxes / placeholders in many system fonts (especially on Windows), which
// was the root cause of pieces showing as "outlines". Colour + a contrasting
// outline stroke (applied in InteractiveBoard) distinguishes the two sides
// reliably across every platform.
export const PIECE_SETS: Record<PieceTheme, Record<string, string>> = {
  unicode: {
    wk: "♚",
    wq: "♛",
    wr: "♜",
    wb: "♝",
    wn: "♞",
    wp: "♟",
    bk: "♚",
    bq: "♛",
    br: "♜",
    bb: "♝",
    bn: "♞",
    bp: "♟",
  },
  classic: {
    wk: "♚",
    wq: "♛",
    wr: "♜",
    wb: "♝",
    wn: "♞",
    wp: "♟",
    bk: "♚",
    bq: "♛",
    br: "♜",
    bb: "♝",
    bn: "♞",
    bp: "♟",
  },
  outlined: {
    wk: "♔",
    wq: "♕",
    wr: "♖",
    wb: "♗",
    wn: "♘",
    wp: "♙",
    bk: "♔",
    bq: "♕",
    br: "♖",
    bb: "♗",
    bn: "♘",
    bp: "♙",
  },
};
