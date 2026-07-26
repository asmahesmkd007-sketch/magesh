// Compact read-only board rendered from any FEN. Used inside community
// posts, comments, and the PGN viewer. Pure CSS grid — no drag logic.
const GLYPHS: Record<string, string> = {
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

/** Expand the FEN placement field into an 8x8 char matrix ("." = empty). */
function fenToMatrix(fen: string): string[][] | null {
  const placement = fen.trim().split(/\s+/)[0];
  const ranks = placement.split("/");
  if (ranks.length !== 8) return null;
  const rows: string[][] = [];
  for (const rank of ranks) {
    const row: string[] = [];
    for (const ch of rank) {
      if (/[1-8]/.test(ch)) row.push(...Array(Number(ch)).fill("."));
      else if (GLYPHS[ch]) row.push(ch);
      else return null;
    }
    if (row.length !== 8) return null;
    rows.push(row);
  }
  return rows;
}

export function MiniBoard({
  fen,
  flipped = false,
  highlight = [],
  className = "",
}: {
  fen: string;
  flipped?: boolean;
  /** algebraic squares to highlight, e.g. ["e2","e4"] */
  highlight?: string[];
  className?: string;
}) {
  const matrix = fenToMatrix(fen);
  if (!matrix) {
    return (
      <div
        className={`rounded-xl border border-white/10 p-4 text-xs text-muted-foreground ${className}`}
      >
        Invalid position
      </div>
    );
  }
  const rows = flipped ? [...matrix].reverse().map((r) => [...r].reverse()) : matrix;
  const squareName = (r: number, c: number) => {
    const rr = flipped ? 7 - r : r;
    const cc = flipped ? 7 - c : c;
    return "abcdefgh"[cc] + String(8 - rr);
  };

  return (
    <div className={`overflow-hidden rounded-xl border border-gold/25 shadow-soft ${className}`}>
      <div className="grid aspect-square grid-cols-8 grid-rows-8">
        {rows.flatMap((row, r) =>
          row.map((p, c) => {
            const light = (r + c) % 2 === 0;
            const hi = highlight.includes(squareName(r, c));
            return (
              <div
                key={`${r}-${c}`}
                className="relative grid place-items-center text-[clamp(0.9rem,3.2vw,1.6rem)]"
                style={{
                  background: hi
                    ? "linear-gradient(135deg, #b8963f 0%, #8a6a24 100%)"
                    : light
                      ? "linear-gradient(135deg, #ead6ac 0%, #cda05f 100%)"
                      : "linear-gradient(135deg, #5c2e1f 0%, #2e120e 100%)",
                }}
              >
                {p !== "." && (
                  <span
                    className="select-none leading-none"
                    style={{
                      color: p === p.toUpperCase() ? "#f5e7c1" : "#1c1c1c",
                      textShadow:
                        p === p.toUpperCase()
                          ? "0 1px 0 rgba(0,0,0,0.6)"
                          : "0 1px 0 rgba(255,255,255,0.2)",
                    }}
                  >
                    {GLYPHS[p]}
                  </span>
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
