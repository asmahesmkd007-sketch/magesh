import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { Color, PieceSymbol, Square } from "chess.js";
import { BOARD_THEMES, PIECE_SETS, type BoardSquareColors } from "@/hooks/useBoardSettings";

export type BoardCell = { square: Square; type: PieceSymbol; color: Color } | null;

const DEFAULT_PIECES = PIECE_SETS.unicode;
const DEFAULT_COLORS = BOARD_THEMES.royal;

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
  colors?: BoardSquareColors;
  pieces?: Record<string, string>;
  showCoords?: boolean;
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
  const [placements, setPlacements] = useState<Placed[]>([]);
  const sig = useMemo(() => signature(board), [board]);

  useEffect(() => {
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
    setPlacements(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return placements;
}

export function InteractiveBoard({
  board,
  orientation,
  selected,
  targets = [],
  lastMove,
  checkSquare,
  onSquare,
  disabled,
  colors = DEFAULT_COLORS,
  pieces = DEFAULT_PIECES,
  showCoords = true,
}: Props) {
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
    if (hasPieceAt(sq)) {
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
    <div className="relative mx-auto w-full max-w-[700px]">
      <div className="pointer-events-none absolute -inset-5 rounded-[2rem] bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.18),transparent_58%)] blur-2xl" />
      <div className="relative rounded-[30px] rosewood-sheen shadow-luxe p-3 md:p-4">
        <div className="rounded-[24px] border border-gold/50 bg-[linear-gradient(180deg,rgba(50,18,14,0.95),rgba(26,8,8,0.95))] p-3 md:p-4">
          <div className="gold-frame rounded-[18px] p-2 md:p-3">
            <div className="grid grid-cols-[auto_1fr] grid-rows-[1fr_auto] gap-2">
              <div className="grid grid-rows-8 gap-px pt-2">
                {showCoords &&
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
                style={{ touchAction: drag ? "none" : undefined }}
                className="relative grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-[14px] border border-gold/25 bg-[#2a120d]"
              >
                {/* Squares + highlight layer */}
                {ranks.flatMap((_, r) =>
                  files.map((__, c) => {
                    const sq = squareName(r, c);
                    const light = (r + c) % 2 === 0;
                    const isSelected = selected === sq;
                    const isTarget = targets.includes(sq);
                    const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
                    const isCheck = checkSquare === sq;
                    const hasPiece = board.flat().some((cell) => cell && cell.square === sq);
                    return (
                      <button
                        key={sq}
                        type="button"
                        disabled={disabled}
                        onClick={() => onSquare?.(sq)}
                        className="relative focus:outline-none"
                        style={{
                          background: light ? colors.light : colors.dark,
                          cursor: disabled ? "default" : "pointer",
                        }}
                        aria-label={sq}
                      >
                        <div className="pointer-events-none absolute inset-[6%] border border-black/10" />
                        {isLast && (
                          <div className="pointer-events-none absolute inset-0 bg-[rgba(212,175,55,0.28)]" />
                        )}
                        {isCheck && (
                          <div className="check-glow pointer-events-none absolute inset-0" />
                        )}
                        {isSelected && (
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
                  }),
                )}

                {/* Animated pieces layer */}
                <div className="pointer-events-none absolute inset-0">
                  {placements.map((p) => {
                    const { col, row } = coords(p.square);
                    const isWhite = p.color === "w";
                    return (
                      <div
                        key={p.id}
                        className="absolute left-0 top-0 grid place-items-center will-change-transform"
                        style={{
                          width: "12.5%",
                          height: "12.5%",
                          transform: `translate(${col * 100}%, ${row * 100}%)`,
                          transition: "transform 0.16s cubic-bezier(0.22, 1, 0.36, 1)",
                          zIndex: 5,
                          opacity: drag?.from === p.square ? 0 : 1,
                        }}
                      >
                        <span
                          className={`select-none leading-none ${p.fresh ? "piece-pop" : ""}`}
                          style={{
                            fontSize: squarePx ? `${squarePx * 0.82}px` : "2.2rem",
                            color: isWhite ? colors.lightPiece : colors.darkPiece,
                            WebkitTextStroke: isWhite
                              ? "0.035em rgba(0,0,0,0.65)"
                              : "0.028em rgba(255,255,255,0.32)",
                            textShadow: "0 2px 3px rgba(0,0,0,0.45)",
                          }}
                        >
                          {pieces[`${p.color}${p.type}`]}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Floating piece that follows the cursor while dragging */}
                {drag &&
                  (() => {
                    const p = placements.find((pl) => pl.square === drag.from);
                    if (!p) return null;
                    const isWhite = p.color === "w";
                    return (
                      <span
                        className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 select-none leading-none"
                        style={{
                          left: drag.x,
                          top: drag.y,
                          fontSize: squarePx ? `${squarePx * 0.9}px` : "2.4rem",
                          color: isWhite ? colors.lightPiece : colors.darkPiece,
                          WebkitTextStroke: isWhite
                            ? "0.035em rgba(0,0,0,0.65)"
                            : "0.028em rgba(255,255,255,0.32)",
                          textShadow: "0 6px 10px rgba(0,0,0,0.55)",
                        }}
                      >
                        {pieces[`${p.color}${p.type}`]}
                      </span>
                    );
                  })()}
              </div>

              <div />
              <div className="grid grid-cols-8 gap-px px-1">
                {showCoords &&
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
}
