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

export function Chessboard({ size = "md", highlight = [] }: Props) {
  const boardWidth = size === "lg" ? "w-full max-w-[760px]" : size === "sm" ? "w-full max-w-[280px]" : "w-full max-w-[520px]";
  const pieceSize = size === "lg" ? "text-[2rem] md:text-[2.6rem]" : size === "sm" ? "text-lg" : "text-[1.55rem] md:text-[2rem]";
  const coordSize = size === "sm" ? "text-[9px]" : "text-[10px] md:text-xs";
  const padding = size === "lg" ? "p-3 md:p-4" : size === "sm" ? "p-2" : "p-3";
  const isHi = (r: number, c: number) => highlight.some(([a, b]) => a === r && b === c);

  return (
    <div className={`relative mx-auto ${boardWidth}`}>
      <div className="pointer-events-none absolute -inset-5 rounded-[2rem] bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.18),transparent_58%)] blur-2xl" />
      <div className={`relative rounded-[30px] rosewood-sheen shadow-luxe ${padding}`}>
        <div className="rounded-[24px] border border-gold/50 bg-[linear-gradient(180deg,rgba(50,18,14,0.95),rgba(26,8,8,0.95))] p-3 md:p-4">
          <div className="gold-frame rounded-[18px] p-2 md:p-3">
            <div className="grid grid-cols-[auto_1fr] grid-rows-[1fr_auto] gap-2">
              <div className="grid grid-rows-8 gap-px pt-2">
                {RANKS.map((rank) => (
                  <div key={rank} className={`grid place-items-center ${coordSize} text-gold/70`}>
                    {rank}
                  </div>
                ))}
              </div>

              <div className="grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-[14px] border border-gold/25 bg-[#2a120d]">
                {INITIAL.flatMap((row, r) =>
                  row.split("").map((p, c) => {
                    const light = (r + c) % 2 === 0;
                    return (
                      <div
                        key={`${r}-${c}`}
                        className={`relative grid place-items-center ${pieceSize}`}
                        style={{
                          background: light
                            ? "linear-gradient(135deg, #ead6ac 0%, #cda05f 100%)"
                            : "linear-gradient(135deg, #5c2e1f 0%, #2e120e 100%)",
                        }}
                      >
                        <div className="absolute inset-[6%] border border-black/10" />
                        {isHi(r, c) && <div className="absolute inset-0 border-[3px] border-gold shadow-[inset_0_0_24px_rgba(212,175,55,0.28)]" />}
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

              <div />
              <div className="grid grid-cols-8 gap-px px-1">
                {FILES.map((file) => (
                  <div key={file} className={`grid place-items-center ${coordSize} text-gold/70`}>
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
