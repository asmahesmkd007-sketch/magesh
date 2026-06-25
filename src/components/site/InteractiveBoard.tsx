import type { Color, PieceSymbol, Square } from "chess.js";

export type BoardCell = { square: Square; type: PieceSymbol; color: Color } | null;

const PIECES: Record<string, string> = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
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
};

export function InteractiveBoard({
  board,
  orientation,
  selected,
  targets = [],
  lastMove,
  checkSquare,
  onSquare,
  disabled,
}: Props) {
  const rows = orientation === "w" ? board : [...board].slice().reverse().map((r) => [...r].reverse());
  const ranks = orientation === "w" ? ["8", "7", "6", "5", "4", "3", "2", "1"] : ["1", "2", "3", "4", "5", "6", "7", "8"];
  const files = orientation === "w" ? FILES : [...FILES].reverse();

  const squareName = (r: number, c: number): string => {
    const fileIdx = orientation === "w" ? c : 7 - c;
    const rankIdx = orientation === "w" ? r : 7 - r;
    return `${FILES[fileIdx]}${8 - rankIdx}`;
  };

  return (
    <div className="relative mx-auto w-full max-w-[700px]">
      <div className="pointer-events-none absolute -inset-5 rounded-[2rem] bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.18),transparent_58%)] blur-2xl" />
      <div className="relative rounded-[30px] rosewood-sheen shadow-luxe p-3 md:p-4">
        <div className="rounded-[24px] border border-gold/50 bg-[linear-gradient(180deg,rgba(50,18,14,0.95),rgba(26,8,8,0.95))] p-3 md:p-4">
          <div className="gold-frame rounded-[18px] p-2 md:p-3">
            <div className="grid grid-cols-[auto_1fr] grid-rows-[1fr_auto] gap-2">
              <div className="grid grid-rows-8 gap-px pt-2">
                {ranks.map((rank) => (
                  <div key={rank} className="grid place-items-center text-[10px] md:text-xs text-gold/70">
                    {rank}
                  </div>
                ))}
              </div>

              <div className="grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-[14px] border border-gold/25 bg-[#2a120d]">
                {rows.flatMap((row, r) =>
                  row.map((cell, c) => {
                    const sq = squareName(r, c);
                    const light = (r + c) % 2 === 0;
                    const isSelected = selected === sq;
                    const isTarget = targets.includes(sq);
                    const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
                    const isCheck = checkSquare === sq;
                    return (
                      <button
                        key={sq}
                        type="button"
                        disabled={disabled}
                        onClick={() => onSquare?.(sq)}
                        className="relative grid place-items-center text-[1.7rem] md:text-[2.4rem] focus:outline-none"
                        style={{
                          background: light
                            ? "linear-gradient(135deg, #ead6ac 0%, #cda05f 100%)"
                            : "linear-gradient(135deg, #5c2e1f 0%, #2e120e 100%)",
                          cursor: disabled ? "default" : "pointer",
                        }}
                        aria-label={sq}
                      >
                        <div className="absolute inset-[6%] border border-black/10" />
                        {isLast && <div className="absolute inset-0 bg-[rgba(212,175,55,0.22)]" />}
                        {isCheck && <div className="absolute inset-0 bg-[rgba(220,60,50,0.42)]" />}
                        {isSelected && (
                          <div className="absolute inset-0 border-[3px] border-gold shadow-[inset_0_0_24px_rgba(212,175,55,0.3)]" />
                        )}
                        {isTarget && !cell && (
                          <span className="absolute h-[22%] w-[22%] rounded-full bg-[rgba(212,175,55,0.55)] shadow-[0_0_8px_rgba(212,175,55,0.5)]" />
                        )}
                        {isTarget && cell && (
                          <span className="absolute inset-[4%] rounded-full border-[3px] border-gold/80" />
                        )}
                        {cell && (
                          <span
                            className="relative select-none"
                            style={{
                              color: cell.color === "w" ? "#f5e7c1" : "#16392e",
                              textShadow:
                                cell.color === "w"
                                  ? "0 1px 0 rgba(0,0,0,0.6), 0 0 10px rgba(212,175,55,0.18)"
                                  : "0 1px 0 rgba(255,255,255,0.14), 0 0 10px rgba(15,139,109,0.16)",
                            }}
                          >
                            {PIECES[`${cell.color}${cell.type}`]}
                          </span>
                        )}
                      </button>
                    );
                  }),
                )}
              </div>

              <div />
              <div className="grid grid-cols-8 gap-px px-1">
                {files.map((file) => (
                  <div key={file} className="grid place-items-center text-[10px] md:text-xs text-gold/70">
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
