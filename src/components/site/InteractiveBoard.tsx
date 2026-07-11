import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { Color, PieceSymbol, Square } from "chess.js";
import { BOARD_THEMES, type BoardSquareColors, type PieceTheme } from "@/hooks/useBoardSettings";
import { useGameSettings } from "@/hooks/useGameSettings";
import { PieceGlyph } from "@/lib/chess/pieceThemes";
import React from "react";

export type BoardCell = { square: Square; type: PieceSymbol; color: Color } | null;

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

type Props = {
  board: BoardCell[][];
  orientation: "w" | "b";
  selected?: string | null;
  targets?: string[];
  lastMove?: { from: string; to: string } | null;
  checkSquare?: string | null;
  onSquare?: (square: string) => void;
  disabled?: boolean;
  /** Override the board colours; defaults to the user's saved board theme. */
  colors?: BoardSquareColors;
  /** Override the piece set; defaults to the user's saved piece theme. */
  pieceTheme?: PieceTheme;
  showCoords?: boolean;
  endState?: { result: "white" | "black" | "draw"; reason: string } | null;
};

type Placed = { id: string; color: Color; type: PieceSymbol; square: string; fresh: boolean };

// Board signature — changes only when the actual position changes, so the
// identity-tracking effect doesn't run on unrelated re-renders.
function signature(board: BoardCell[][]): string {
  let s = "";
  for (const row of board) for (const c of row) s += c ? c.color + c.type : ".";
  return s;
}

/**
 * Assigns a stable id to every piece across positions so React keeps the same
 * DOM node when a piece moves — the node then slides to its new square via a CSS
 * transform transition (chessox.com style). A piece keeps its id when it stays put
 * or when it is the piece that moved (from -> to, including promotions).
 */
function useStablePieces(board: BoardCell[][], lastMove?: { from: string; to: string } | null) {
  const prevRef = useRef<Map<string, { id: string; color: Color; type: PieceSymbol }>>(new Map());
  const counterRef = useRef(0);
  const sig = useMemo(() => signature(board), [board]);

  const placements = useMemo(() => {
    const prev = prevRef.current;
    const next = new Map<string, { id: string; color: Color; type: PieceSymbol }>();
    const used = new Set<string>();
    const out: Placed[] = [];

    for (const row of board) {
      for (const cell of row) {
        if (!cell) continue;
        const sq = cell.square;
        let id: string | undefined;
        let fresh = false;

        const stay = prev.get(sq);
        if (stay && !used.has(stay.id) && stay.color === cell.color && stay.type === cell.type) {
          id = stay.id;
        } else if (lastMove && sq === lastMove.to) {
          const moved = prev.get(lastMove.from);
          if (moved && !used.has(moved.id) && moved.color === cell.color) id = moved.id;
        }
        if (!id) {
          id = `pc${counterRef.current++}`;
          fresh = prev.size > 0; // don't pop-animate the very first render
        }

        used.add(id);
        next.set(sq, { id, color: cell.color, type: cell.type });
        out.push({ id, color: cell.color, type: cell.type, square: sq, fresh });
      }
    }

    prevRef.current = next;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return placements;
}

const MemoizedSquare = React.memo(function MemoizedSquare({
  sq,
  light,
  activeColors,
  disabled,
  onSquare,
  isLast,
  isCheck,
  isSelected,
  isTarget,
  hasPiece,
  isWinnerKing,
  isLoserKing,
  endStateActive,
}: {
  sq: string;
  light: boolean;
  activeColors: BoardSquareColors;
  disabled: boolean | undefined;
  onSquare: ((sq: string) => void) | undefined;
  isLast: boolean | null | undefined;
  isCheck: boolean;
  isSelected: boolean;
  isTarget: boolean;
  hasPiece: boolean;
  isWinnerKing: boolean;
  isLoserKing: boolean;
  endStateActive: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSquare?.(sq)}
      className="relative focus:outline-none"
      style={{
        background: light ? activeColors.light : activeColors.dark,
        cursor: disabled ? "default" : "pointer",
      }}
      aria-label={sq}
    >
      <div className="pointer-events-none absolute inset-[6%] border border-black/10" />
      {isLast && (
        <div className="pointer-events-none absolute inset-0 bg-[rgba(212,175,55,0.28)]" />
      )}
      {isCheck && !endStateActive && (
        <div className="check-glow pointer-events-none absolute inset-0" />
      )}
      {isLoserKing && (
        <div className="pointer-events-none absolute inset-0 bg-red-500/40 shadow-[inset_0_0_24px_rgba(239,68,68,0.6)]" />
      )}
      {isWinnerKing && (
        <div className="pointer-events-none absolute inset-0 bg-gold/30 shadow-[inset_0_0_24px_rgba(212,175,55,0.6)]" />
      )}
      {isSelected && !endStateActive && (
        <div className="pointer-events-none absolute inset-0 border-[3px] border-gold shadow-[inset_0_0_24px_rgba(212,175,55,0.3)]" />
      )}
      {isTarget && !hasPiece && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-[24%] w-[24%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(212,175,55,0.55)] shadow-[0_0_8px_rgba(212,175,55,0.5)]" />
      )}
      {isTarget && hasPiece && (
        <span className="pointer-events-none absolute inset-[4%] rounded-full border-[3px] border-gold/80" />
      )}
    </button>
  );
});

const MemoizedPiece = React.memo(function MemoizedPiece({
  p,
  col,
  row,
  pieceTransition,
  isDragged,
  animate,
  activePieceTheme,
}: {
  p: Placed;
  col: number;
  row: number;
  pieceTransition: string;
  isDragged: boolean;
  animate: boolean;
  activePieceTheme: PieceTheme;
}) {
  return (
    <div
      className="absolute left-0 top-0 grid place-items-center will-change-transform"
      style={{
        width: "12.5%",
        height: "12.5%",
        transform: `translate3d(${col * 100}%, ${row * 100}%, 0)`,
        transition: pieceTransition,
        zIndex: 5,
        opacity: isDragged ? 0 : 1,
      }}
    >
      <div
        className={`h-[86%] w-[86%] ${p.fresh && animate ? "piece-pop" : ""}`}
        style={{ transform: "scale(var(--cx-piece-scale, 1))" }}
      >
        <PieceGlyph theme={activePieceTheme} color={p.color} type={p.type} />
      </div>
    </div>
  );
});

export const InteractiveBoard = React.memo(function InteractiveBoard({
  board,
  orientation,
  selected,
  targets = [],
  lastMove,
  checkSquare,
  onSquare,
  disabled,
  colors,
  pieceTheme,
  showCoords,
  endState,
}: Props) {
  // Fall back to the user's saved settings so every board mode (Play, Bot,
  // Analysis, Puzzle, Tournament, Replay, Spectator) reflects them automatically.
  const { settings } = useGameSettings();
  const activeColors = colors ?? BOARD_THEMES[settings.board_theme];
  const activePieceTheme = pieceTheme ?? settings.piece_theme;
  const showCoordinates = showCoords ?? settings.show_coordinates;
  const animate = settings.board_animation && !settings.reduced_motion;
  const allowDrag = settings.move_method !== "click";
  const pieceTransition = animate ? "transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)" : "none";

  // Board size preset × zoom drives the max on-screen width (all boards, all modes).
  const baseWidth = settings.board_size === "small" ? 480 : settings.board_size === "large" ? 720 : 600;
  const boardMaxWidth = Math.round(baseWidth * (settings.board_zoom / 100));
  const snapToSquare = settings.snap_to_square;

  // Centre of the square under a client point, for snap-to-square dragging.
  const squareCenterFromPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return null;
    const c = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const r = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (c < 0 || c > 7 || r < 0 || r > 7) return null;
    const cell = rect.width / 8;
    return { x: rect.left + (c + 0.5) * cell, y: rect.top + (r + 0.5) * cell };
  };

  const placements = useStablePieces(board, lastMove);

  // Track the pixel size of a square so piece glyphs scale crisply to any layout.
  const gridRef = useRef<HTMLDivElement>(null);
  const [squarePx, setSquarePx] = useState(0);

  // ── Drag-and-drop ──────────────────────────────────────────────────
  // Pointer-driven dragging that reuses the exact same onSquare(from) →
  // onSquare(to) flow as click/tap-to-move, so all validation, promotion
  // and optimistic-update logic stays in one place. Keyboard activation of
  // the square buttons still works; the trailing synthetic click after a
  // pointer interaction is swallowed via suppressClickRef so it never
  // double-fires onSquare.
  const [drag, setDrag] = useState<{ from: string; x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const suppressClickRef = useRef(false);

  const hasPieceAt = (sq: string) => board.flat().some((cell) => cell && cell.square === sq);

  const squareFromPoint = (clientX: number, clientY: number): string | null => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return null;
    const c = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const r = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (c < 0 || c > 7 || r < 0 || r > 7) return null;
    return squareName(r, c);
  };

  const onGridPointerDown = (e: ReactPointerEvent) => {
    if (disabled || e.button !== 0) return;
    const sq = squareFromPoint(e.clientX, e.clientY);
    if (!sq) return;
    // Drive the move/select from the pointer; swallow the trailing click.
    suppressClickRef.current = true;
    onSquare?.(sq);
    draggedRef.current = false;
    // Respect the Move method setting — "click only" skips pointer dragging.
    if (allowDrag && hasPieceAt(sq)) {
      setDrag({ from: sq, x: e.clientX, y: e.clientY });
      gridRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const onGridPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) > 4 || Math.abs(e.clientY - drag.y) > 4) {
      draggedRef.current = true;
    }
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
  };

  const endDrag = (e: ReactPointerEvent) => {
    if (!drag) return;
    const target = squareFromPoint(e.clientX, e.clientY);
    if (draggedRef.current && target && target !== drag.from) {
      onSquare?.(target);
    }
    setDrag(null);
    try {
      gridRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  const onGridClickCapture = (e: ReactMouseEvent) => {
    // Swallow the click that follows a pointer interaction so onSquare,
    // already called on pointerdown/up, doesn't fire a second time.
    if (suppressClickRef.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressClickRef.current = false;
    }
  };
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSquarePx(e.contentRect.width / 8));
    ro.observe(el);
    setSquarePx(el.clientWidth / 8);
    return () => ro.disconnect();
  }, []);

  const ranks =
    orientation === "w"
      ? ["8", "7", "6", "5", "4", "3", "2", "1"]
      : ["1", "2", "3", "4", "5", "6", "7", "8"];
  const files = orientation === "w" ? FILES : [...FILES].reverse();

  const squareName = (r: number, c: number): string => {
    const fileIdx = orientation === "w" ? c : 7 - c;
    const rankIdx = orientation === "w" ? r : 7 - r;
    return `${FILES[fileIdx]}${8 - rankIdx}`;
  };

  // Display row/col for a square in the current orientation.
  const coords = (sq: string): { col: number; row: number } => {
    const file = sq.charCodeAt(0) - 97;
    const rank = Number(sq[1]) - 1;
    return orientation === "w" ? { col: file, row: 7 - rank } : { col: 7 - file, row: rank };
  };

  return (
    <div
      className="cx-board-root relative mx-auto w-full"
      style={{ maxWidth: boardMaxWidth }}
    >
      <div className="pointer-events-none absolute -inset-5 rounded-[2rem] bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.18),transparent_58%)] blur-2xl" />
      <div className="relative rounded-[30px] rosewood-sheen shadow-luxe p-3 md:p-4">
        <div className="rounded-[24px] border border-gold/50 bg-[linear-gradient(180deg,rgba(50,18,14,0.95),rgba(26,8,8,0.95))] p-3 md:p-4">
          <div className="gold-frame rounded-[18px] p-2 md:p-3">
            <div className="grid grid-cols-[auto_1fr] grid-rows-[1fr_auto] gap-2">
              <div className="grid grid-rows-8 gap-px pt-2">
                {showCoordinates &&
                  ranks.map((rank) => (
                    <div
                      key={rank}
                      className="grid place-items-center text-[10px] md:text-xs text-gold/70"
                    >
                      {rank}
                    </div>
                  ))}
              </div>

              <div
                ref={gridRef}
                onPointerDown={onGridPointerDown}
                onPointerMove={onGridPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onClickCapture={onGridClickCapture}
                style={{ touchAction: "none" }}
                className="relative grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-[14px] border border-gold/25 bg-[#2a120d]"
              >
                {/* Squares + highlight layer */}
                {ranks.flatMap((_, r) =>
                  files.map((__, c) => {
                    const sq = squareName(r, c);
                    const light = (r + c) % 2 === 0;
                    const isSelected = settings.show_move_highlights && selected === sq;
                    const isTarget = settings.show_legal_moves && targets.includes(sq);
                    const isLast = settings.show_last_move && lastMove && (lastMove.from === sq || lastMove.to === sq);
                    const hasPiece = board.flat().some((cell) => cell && cell.square === sq);

                    let isCheck = settings.show_check_highlight && checkSquare === sq;
                    let isWinnerKing = false;
                    let isLoserKing = false;

                    if (endState && hasPiece) {
                      const p = board.flat().find((c) => c?.square === sq)!;
                      if (p.type === "k") {
                        if (endState.result === "white" && p.color === "w") isWinnerKing = true;
                        if (endState.result === "white" && p.color === "b") isLoserKing = true;
                        if (endState.result === "black" && p.color === "b") isWinnerKing = true;
                        if (endState.result === "black" && p.color === "w") isLoserKing = true;
                        if (endState.result === "draw") isWinnerKing = true; // highlight both in draw
                      }
                    }

                    return (
                      <MemoizedSquare
                        key={sq}
                        sq={sq}
                        light={light}
                        activeColors={activeColors}
                        disabled={disabled}
                        onSquare={onSquare}
                        isLast={isLast}
                        isCheck={isCheck}
                        isSelected={isSelected}
                        isTarget={isTarget}
                        hasPiece={hasPiece}
                        isWinnerKing={isWinnerKing}
                        isLoserKing={isLoserKing}
                        endStateActive={!!endState}
                      />
                    );
                  }),
                )}

                {/* Animated pieces layer */}
                <div className="pointer-events-none absolute inset-0">
                  {placements.map((p) => {
                    const { col, row } = coords(p.square);
                    return (
                      <MemoizedPiece
                        key={p.id}
                        p={p}
                        col={col}
                        row={row}
                        pieceTransition={pieceTransition}
                        isDragged={drag?.from === p.square}
                        animate={animate}
                        activePieceTheme={activePieceTheme}
                      />
                    );
                  })}
                </div>

                {/* Floating piece that follows the cursor while dragging */}
                {drag &&
                  (() => {
                    const p = placements.find((pl) => pl.square === drag.from);
                    if (!p) return null;
                    const fs = squarePx ? squarePx * 0.9 : 40;
                    const snapped = snapToSquare ? squareCenterFromPoint(drag.x, drag.y) : null;
                    const px = snapped?.x ?? drag.x;
                    const py = snapped?.y ?? drag.y;
                    return (
                      <span
                        className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 select-none"
                        style={{ left: px, top: py, width: fs, height: fs }}
                      >
                        <PieceGlyph theme={activePieceTheme} color={p.color} type={p.type} />
                      </span>
                    );
                  })()}
                
                {/* Checkmate / End State Overlay */}
                {endState && (
                  <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] tw-animate-fade-in tw-duration-500">
                    <div className="rounded-2xl border border-gold/30 bg-black/80 px-8 py-5 text-center shadow-2xl shadow-gold/20 backdrop-blur-md">
                      <div className="font-display text-2xl tracking-wide text-gradient-gold">
                        {endState.result === "white"
                          ? "White Wins"
                          : endState.result === "black"
                            ? "Black Wins"
                            : "Draw"}
                      </div>
                      <div className="mt-1 text-sm font-medium uppercase tracking-widest text-muted-foreground">
                        {endState.reason}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div />
              <div className="grid grid-cols-8 gap-px px-1">
                {showCoordinates &&
                  files.map((file) => (
                    <div
                      key={file}
                      className="grid place-items-center text-[10px] md:text-xs text-gold/70"
                    >
                      {file}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
