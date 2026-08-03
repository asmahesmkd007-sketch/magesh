import { memo } from "react";

type Props = {
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  highlight?: [number, number][];
};

const PIECES: Record<string, string> = {
  r: "♜",
  n: "♞",
  b: "♝",
  q: "♛",
  k: "♚",
  p: "♟",
  R: "♖",
  N: "♘",
  B: "♗",
  Q: "♕",
  K: "♔",
  P: "♙",
};

const INITIAL = [
  "rnbqkbnr",
  "pppppppp",
  "........",
  "........",
  "........",
  "........",
  "PPPPPPPP",
  "RNBQKBNR",
];

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

// Purely decorative — always the starting position. It builds 64 cells with
// inline gradients, so without memo it rebuilt that whole subtree on every
// parent render (home.tsx in particular re-renders on a lot of unrelated
// state). Props are primitives at both call sites, so the comparison is free.
export const Chessboard = memo(function Chessboard({ size = "md", highlight = [] }: Props) {
  const boardWidth =
    size === "lg"
      ? "w-full max-w-[760px]"
      : size === "sm"
        ? "w-full max-w-[280px]"
        : "w-full max-w-[520px]";
  const pieceSize =
    size === "lg"
      ? "text-[2rem] md:text-[2.6rem]"
      : size === "sm"
        ? "text-lg"
        : "text-[1.55rem] md:text-[2rem]";
  const padding = size === "lg" ? "p-3 md:p-4" : size === "sm" ? "p-2" : "p-3";
  const isHi = (r: number, c: number) => highlight.some(([a, b]) => a === r && b === c);

  return (
    <div className={`relative mx-auto ${boardWidth}`}>
      <div className="grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-2xl border border-gold/40 shadow-2xl bg-[#2a120d]">
        {INITIAL.flatMap((row, r) =>
          row.split("").map((p, c) => {
            const light = (r + c) % 2 === 0;
            const rankLabel = c === 0 ? RANKS[r] : null;
            const fileLabel = r === 7 ? FILES[c] : null;

            return (
              <div
                key={`${r}-${c}`}
                className={`relative grid place-items-center select-none ${pieceSize}`}
                style={{
                  background: light
                    ? "linear-gradient(135deg, #ead6ac 0%, #cda05f 100%)"
                    : "linear-gradient(135deg, #5c2e1f 0%, #2e120e 100%)",
                }}
              >
                <div className="absolute inset-[6%] border border-black/10" />

                {/* Inside Coordinates */}
                {rankLabel && (
                  <span
                    className="pointer-events-none absolute left-1 top-0.5 text-[9px] sm:text-[10px] font-bold select-none z-10"
                    style={{ color: light ? "#2e120e" : "#ead6ac", opacity: 0.85 }}
                  >
                    {rankLabel}
                  </span>
                )}
                {fileLabel && (
                  <span
                    className="pointer-events-none absolute right-1 bottom-0.5 text-[9px] sm:text-[10px] font-bold select-none z-10"
                    style={{ color: light ? "#2e120e" : "#ead6ac", opacity: 0.85 }}
                  >
                    {fileLabel}
                  </span>
                )}

                {isHi(r, c) && (
                  <div className="absolute inset-0 border-[3px] border-gold shadow-[inset_0_0_24px_rgba(212,175,55,0.28)]" />
                )}
                {p !== "." && (
                  <span
                    className="relative select-none"
                    style={{
                      color: p === p.toUpperCase() ? "#f5e7c1" : "#16392e",
                      textShadow:
                        p === p.toUpperCase()
                          ? "0 1px 0 rgba(0,0,0,0.6), 0 0 10px rgba(212,175,55,0.18)"
                          : "0 1px 0 rgba(255,255,255,0.14), 0 0 10px rgba(15,139,109,0.16)",
                    }}
                  >
                    {PIECES[p]}
                  </span>
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
});
