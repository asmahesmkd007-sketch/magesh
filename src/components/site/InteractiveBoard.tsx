import {
  useCallback,
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
import {
  assignPieceIds,
  boardSignature,
  initialPieceIdState,
  type PieceIdState,
  type Placed,
} from "@/lib/chess/pieceIdentity";
import React from "react";

export type BoardCell = { square: Square; type: PieceSymbol; color: Color } | null;

/** An arrow drawn over the board (engine suggestions, annotations). */
export type BoardArrow = {
  from: string;
  to: string;
  /** Any CSS color; defaults to the gold accent. */
  color?: string;
  /** 0–1 relative emphasis; scales width and opacity (default 1). */
  weight?: number;
};

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
  /** Arrows rendered over the board (engine lines, annotations). */
  arrows?: BoardArrow[];
};

function useStablePieces(board: BoardCell[][], lastMove?: { from: string; to: string } | null) {
  const cacheRef = useRef<PieceIdState>(initialPieceIdState());
  const sig = useMemo(() => boardSignature(board), [board]);

  if (cacheRef.current.sig === sig) return cacheRef.current.out;
  cacheRef.current = assignPieceIds(board, lastMove ?? null, cacheRef.current, sig);
  return cacheRef.current.out;
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
  rankLabel,
  fileLabel,
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
  rankLabel?: string | null;
  fileLabel?: string | null;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSquare?.(sq)}
      className="relative focus:outline-none select-none"
      style={{
        background: light ? activeColors.light : activeColors.dark,
        cursor: disabled ? "default" : "pointer",
      }}
      aria-label={sq}
    >
      <div className="pointer-events-none absolute inset-[6%] border border-black/10" />

      {/* Inside Board Coordinates */}
      {rankLabel && (
        <span
          className="pointer-events-none absolute left-1 top-0.5 text-[9px] sm:text-[11px] font-bold select-none z-10"
          style={{ color: light ? activeColors.dark : activeColors.light, opacity: 0.85 }}
        >
          {rankLabel}
        </span>
      )}
      {fileLabel && (
        <span
          className="pointer-events-none absolute right-1 bottom-0.5 text-[9px] sm:text-[11px] font-bold select-none z-10"
          style={{ color: light ? activeColors.dark : activeColors.light, opacity: 0.85 }}
        >
          {fileLabel}
        </span>
      )}

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
      className="absolute left-0 top-0 grid place-items-center will-change-transform pointer-events-none"
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
  arrows,
}: Props) {
  const { settings } = useGameSettings();
  const activeColors = colors ?? BOARD_THEMES[settings.board_theme];
  const activePieceTheme = pieceTheme ?? settings.piece_theme;
  const showCoordinates = showCoords ?? settings.show_coordinates;
  const animate = settings.board_animation && !settings.reduced_motion;
  const allowDrag = settings.move_method !== "click";
  const pieceTransition = animate ? "transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)" : "none";

  const baseWidth =
    settings.board_size === "small" ? 480 : settings.board_size === "large" ? 720 : 600;
  const boardMaxWidth = Math.round(baseWidth * (settings.board_zoom / 100));
  const snapToSquare = settings.snap_to_square;

  const squareCenterFromPoint = (
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null => {
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

  const pieceBySquare = useMemo(() => {
    const m = new Map<string, { square: Square; type: PieceSymbol; color: Color }>();
    for (const row of board) for (const cell of row) if (cell) m.set(cell.square, cell);
    return m;
  }, [board]);

  const gridRef = useRef<HTMLDivElement>(null);
  const [squarePx, setSquarePx] = useState(0);

  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const dragFromRef = useRef<string | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const floatRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number | null>(null);
  const draggedRef = useRef(false);
  const suppressClickRef = useRef(false);

  const hasPieceAt = (sq: string) => pieceBySquare.has(sq);

  const onSquareRef = useRef(onSquare);
  useEffect(() => {
    onSquareRef.current = onSquare;
  }, [onSquare]);
  const stableOnSquare = useCallback((sq: string) => onSquareRef.current?.(sq), []);

  const paintFloat = () => {
    rafRef.current = null;
    const el = floatRef.current;
    const pt = pointerRef.current;
    if (!el || !pt) return;
    const snapped = snapToSquare ? squareCenterFromPoint(pt.x, pt.y) : null;
    const x = snapped?.x ?? pt.x;
    const y = snapped?.y ?? pt.y;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  };

  const schedulePaint = () => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(paintFloat);
  };

  useEffect(() => {
    if (dragFrom) paintFloat();
  }, [dragFrom]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

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
    suppressClickRef.current = true;
    onSquare?.(sq);
    draggedRef.current = false;
    if (allowDrag && hasPieceAt(sq)) {
      dragFromRef.current = sq;
      dragOriginRef.current = { x: e.clientX, y: e.clientY };
      pointerRef.current = { x: e.clientX, y: e.clientY };
      setDragFrom(sq);
      gridRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const onGridPointerMove = (e: ReactPointerEvent) => {
    const origin = dragOriginRef.current;
    if (!origin) return;
    if (Math.abs(e.clientX - origin.x) > 4 || Math.abs(e.clientY - origin.y) > 4) {
      draggedRef.current = true;
    }
    pointerRef.current = { x: e.clientX, y: e.clientY };
    schedulePaint();
  };

  const endDrag = (e: ReactPointerEvent) => {
    const from = dragFromRef.current;
    if (!from) return;
    const target = squareFromPoint(e.clientX, e.clientY);
    if (draggedRef.current && target && target !== from) {
      onSquare?.(target);
    }
    dragFromRef.current = null;
    dragOriginRef.current = null;
    pointerRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setDragFrom(null);
    try {
      gridRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  const onGridClickCapture = (e: ReactMouseEvent) => {
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

  // Rebuilt only when the board is flipped, so they can be memo dependencies
  // for the square grid below instead of invalidating it on every render.
  const ranks = useMemo(
    () =>
      orientation === "w"
        ? ["8", "7", "6", "5", "4", "3", "2", "1"]
        : ["1", "2", "3", "4", "5", "6", "7", "8"],
    [orientation],
  );
  const files = useMemo(() => (orientation === "w" ? FILES : [...FILES].reverse()), [orientation]);

  // `targets.includes(sq)` inside the 64-square loop is a linear scan per
  // square — up to ~27 legal targets × 64 squares on every board render, for
  // a lookup that is O(1) with a Set.
  const targetSet = useMemo(() => new Set(targets), [targets]);

  const squareName = (r: number, c: number): string => {
    const fileIdx = orientation === "w" ? c : 7 - c;
    const rankIdx = orientation === "w" ? r : 7 - r;
    return `${FILES[fileIdx]}${8 - rankIdx}`;
  };

  const coords = (sq: string): { col: number; row: number } => {
    const file = sq.charCodeAt(0) - 97;
    const rank = Number(sq[1]) - 1;
    return orientation === "w" ? { col: file, row: 7 - rank } : { col: 7 - file, row: rank };
  };

  // The 64 squares are the bulk of the board's element tree. Memoizing them
  // means a render triggered by something the squares don't depend on — a
  // drag starting, the container resizing, an arrow overlay updating — reuses
  // the whole grid instead of rebuilding 64 elements and their prop objects.
  // Every value read inside is listed; the individual settings flags are
  // primitives off the now-stable shared settings snapshot.
  const squares = useMemo(
    () =>
      ranks.flatMap((_, r) =>
        files.map((__, c) => {
          const sq = squareName(r, c);
          const light = (r + c) % 2 === 0;
          const isSelected = settings.show_move_highlights && selected === sq;
          const isTarget = settings.show_legal_moves && targetSet.has(sq);
          const isLast =
            settings.show_last_move && lastMove && (lastMove.from === sq || lastMove.to === sq);
          const pieceHere = pieceBySquare.get(sq);
          const hasPiece = !!pieceHere;

          const isCheck = settings.show_check_highlight && checkSquare === sq;
          let isWinnerKing = false;
          let isLoserKing = false;

          if (endState && pieceHere) {
            const p = pieceHere;
            if (p.type === "k") {
              if (endState.result === "white" && p.color === "w") isWinnerKing = true;
              if (endState.result === "white" && p.color === "b") isLoserKing = true;
              if (endState.result === "black" && p.color === "b") isWinnerKing = true;
              if (endState.result === "black" && p.color === "w") isLoserKing = true;
              if (endState.result === "draw") isWinnerKing = true;
            }
          }

          const rankLabel = showCoordinates && c === 0 ? ranks[r] : null;
          const fileLabel = showCoordinates && r === 7 ? files[c] : null;

          return (
            <MemoizedSquare
              key={sq}
              sq={sq}
              light={light}
              activeColors={activeColors}
              disabled={disabled}
              onSquare={stableOnSquare}
              isLast={isLast}
              isCheck={isCheck}
              isSelected={isSelected}
              isTarget={isTarget}
              hasPiece={hasPiece}
              isWinnerKing={isWinnerKing}
              isLoserKing={isLoserKing}
              endStateActive={!!endState}
              rankLabel={rankLabel}
              fileLabel={fileLabel}
            />
          );
        }),
      ),
    // squareName/coords close over `orientation`, which ranks/files already track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      ranks,
      files,
      orientation,
      selected,
      targetSet,
      lastMove,
      checkSquare,
      pieceBySquare,
      endState,
      showCoordinates,
      activeColors,
      disabled,
      stableOnSquare,
      settings.show_move_highlights,
      settings.show_legal_moves,
      settings.show_last_move,
      settings.show_check_highlight,
    ],
  );

  return (
    <div className="cx-board-root relative mx-auto w-full" style={{ maxWidth: boardMaxWidth }}>
      <div
        ref={gridRef}
        onPointerDown={onGridPointerDown}
        onPointerMove={onGridPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onGridClickCapture}
        style={{ touchAction: "none" }}
        className="relative grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-2xl border border-gold/40 shadow-2xl bg-[#2a120d]"
      >
        {/* Squares + highlight layer */}
        {squares}

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
                isDragged={dragFrom === p.square}
                animate={animate}
                activePieceTheme={activePieceTheme}
              />
            );
          })}
        </div>

        {/* Arrow overlay */}
        {arrows && arrows.length > 0 && (
          <svg
            viewBox="0 0 8 8"
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ zIndex: 20 }}
            aria-hidden="true"
          >
            {arrows.map((a, i) => {
              const from = coords(a.from);
              const to = coords(a.to);
              const x1 = from.col + 0.5;
              const y1 = from.row + 0.5;
              const x2 = to.col + 0.5;
              const y2 = to.row + 0.5;
              const dx = x2 - x1;
              const dy = y2 - y1;
              const len = Math.hypot(dx, dy);
              if (len === 0) return null;
              const ux = dx / len;
              const uy = dy / len;
              const weight = a.weight ?? 1;
              const color = a.color ?? "rgb(212,175,55)";
              const width = 0.14 * (0.6 + 0.4 * weight);
              const head = 0.3 * (0.7 + 0.3 * weight);
              const sx = x1 + ux * 0.3;
              const sy = y1 + uy * 0.3;
              const hx = x2 - ux * head;
              const hy = y2 - uy * head;
              const px = -uy;
              const py = ux;
              return (
                <g key={`${a.from}${a.to}${i}`} opacity={0.5 + 0.35 * weight}>
                  <line
                    x1={sx}
                    y1={sy}
                    x2={hx}
                    y2={hy}
                    stroke={color}
                    strokeWidth={width}
                    strokeLinecap="round"
                  />
                  <polygon
                    fill={color}
                    points={`${x2},${y2} ${hx + px * head * 0.6},${hy + py * head * 0.6} ${hx - px * head * 0.6},${hy - py * head * 0.6}`}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {/* Floating piece that follows cursor while dragging */}
        {dragFrom &&
          (() => {
            const p = placements.find((pl) => pl.square === dragFrom);
            if (!p) return null;
            const fs = squarePx ? squarePx * 0.9 : 40;
            return (
              <span
                ref={floatRef}
                className="pointer-events-none fixed left-0 top-0 z-50 select-none will-change-transform"
                style={{ width: fs, height: fs }}
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
    </div>
  );
});
