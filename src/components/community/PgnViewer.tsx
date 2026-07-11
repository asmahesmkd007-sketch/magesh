// PGN replay + puzzle viewer for community posts. Uses chess.js as the
// single rules authority (same as the rest of the app).
import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  FlipVertical2,
  Lightbulb,
} from "lucide-react";
import { loadPgnSafe, isValidFen, START_FEN } from "@/lib/chess/validation";
import { detectOpening } from "@/lib/chess/openings";
import { MiniBoard } from "./MiniBoard";

function useReplay(startFen: string, sans: string[]) {
  const [ply, setPly] = useState(0);
  const positions = useMemo(() => {
    const chess = new Chess(startFen);
    const fens = [startFen];
    const moves: { from: string; to: string }[] = [];
    for (const san of sans) {
      try {
        const mv = chess.move(san);
        fens.push(chess.fen());
        moves.push({ from: mv.from, to: mv.to });
      } catch {
        break;
      }
    }
    return { fens, moves };
  }, [startFen, sans]);
  const max = positions.fens.length - 1;
  const clamped = Math.min(ply, max);
  return {
    ply: clamped,
    max,
    fen: positions.fens[clamped],
    lastMove: clamped > 0 ? positions.moves[clamped - 1] : null,
    setPly: (n: number) => setPly(Math.max(0, Math.min(n, max))),
  };
}

function ReplayControls({
  ply,
  max,
  setPly,
  flipped,
  onFlip,
}: {
  ply: number;
  max: number;
  setPly: (n: number) => void;
  flipped: boolean;
  onFlip: () => void;
}) {
  const btn =
    "grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:border-gold/40 hover:text-gold disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-muted-foreground";
  return (
    <div className="mt-2 flex items-center justify-center gap-1.5">
      <button type="button" className={btn} onClick={() => setPly(0)} disabled={ply === 0} aria-label="Start">
        <ChevronFirst className="h-4 w-4" />
      </button>
      <button type="button" className={btn} onClick={() => setPly(ply - 1)} disabled={ply === 0} aria-label="Back">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-14 text-center text-xs text-muted-foreground">
        {ply}/{max}
      </span>
      <button type="button" className={btn} onClick={() => setPly(ply + 1)} disabled={ply === max} aria-label="Next">
        <ChevronRight className="h-4 w-4" />
      </button>
      <button type="button" className={btn} onClick={() => setPly(max)} disabled={ply === max} aria-label="End">
        <ChevronLast className="h-4 w-4" />
      </button>
      <button type="button" className={btn} onClick={onFlip} aria-label="Flip board">
        <FlipVertical2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export function PgnViewer({ pgn }: { pgn: string }) {
  const game = useMemo(() => loadPgnSafe(pgn), [pgn]);
  const sans = game?.sans ?? [];
  const opening = useMemo(() => (sans.length ? detectOpening(sans) : null), [sans]);
  const [flipped, setFlipped] = useState(false);
  const replay = useReplay(START_FEN, sans);

  if (!game) {
    return (
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-muted-foreground">
        {pgn}
      </pre>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_1fr]">
      <div>
        <MiniBoard
          fen={replay.fen}
          flipped={flipped}
          highlight={replay.lastMove ? [replay.lastMove.from, replay.lastMove.to] : []}
        />
        <ReplayControls
          ply={replay.ply}
          max={replay.max}
          setPly={replay.setPly}
          flipped={flipped}
          onFlip={() => setFlipped((f) => !f)}
        />
      </div>
      <div className="min-w-0">
        {opening && (
          <div className="mb-2 text-xs text-gold/80">
            {opening.eco} · {opening.name}
          </div>
        )}
        <div className="flex max-h-56 flex-wrap content-start gap-1 overflow-y-auto text-xs">
          {sans.map((san, i) => (
            <button
              type="button"
              key={i}
              onClick={() => replay.setPly(i + 1)}
              className={`rounded px-1.5 py-0.5 font-mono ${
                replay.ply === i + 1
                  ? "bg-gold/20 text-gold"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`}
            >
              {i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ""}
              {san}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Puzzle post: position + step-through solution reveal. */
export function PuzzleViewer({ fen, solution }: { fen: string; solution: string | null }) {
  const valid = isValidFen(fen);
  const sans = useMemo(
    () => (solution ? solution.trim().split(/\s+/).filter(Boolean) : []),
    [solution],
  );
  const [flipped, setFlipped] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const replay = useReplay(valid ? fen : START_FEN, sans);
  const sideToMove = valid ? (fen.split(/\s+/)[1] === "b" ? "Black" : "White") : "White";

  if (!valid) return <MiniBoard fen={START_FEN} className="max-w-[260px]" />;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs text-gold/80">
        <Lightbulb className="h-3.5 w-3.5" />
        Puzzle — {sideToMove} to move
      </div>
      <div className="max-w-[280px]">
        <MiniBoard
          fen={replay.fen}
          flipped={flipped}
          highlight={replay.lastMove ? [replay.lastMove.from, replay.lastMove.to] : []}
        />
        {revealed && sans.length > 0 ? (
          <ReplayControls
            ply={replay.ply}
            max={replay.max}
            setPly={replay.setPly}
            flipped={flipped}
            onFlip={() => setFlipped((f) => !f)}
          />
        ) : sans.length > 0 ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mt-2 w-full rounded-lg border border-gold/30 py-1.5 text-xs text-gold hover:bg-gold/10"
          >
            Show solution ({sans.length} move{sans.length > 1 ? "s" : ""})
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Single-position post. */
export function FenViewer({ fen }: { fen: string }) {
  const [flipped, setFlipped] = useState(false);
  if (!isValidFen(fen)) {
    return (
      <pre className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-muted-foreground">
        {fen}
      </pre>
    );
  }
  return (
    <div className="max-w-[280px]">
      <MiniBoard fen={fen} flipped={flipped} />
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold"
      >
        <FlipVertical2 className="h-3.5 w-3.5" /> Flip board
      </button>
    </div>
  );
}
