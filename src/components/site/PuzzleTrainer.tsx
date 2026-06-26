import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { toast } from "sonner";
import { ArrowRight, Eye, Flame, Lightbulb, Target } from "lucide-react";
import { Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { InteractiveBoard, type BoardCell } from "@/components/site/InteractiveBoard";
import { PUZZLES, type Puzzle } from "@/lib/chess/puzzles";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const DAILY_GOAL = 20;
const STORE_KEY = "chessox-puzzle-progress";

type Status = "solving" | "showing" | "solved" | "revealed";

function loadProgress(): { streak: number; best: number; solved: number } {
  if (typeof window === "undefined") return { streak: 0, best: 0, solved: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    const today = new Date().toISOString().slice(0, 10);
    return {
      streak: raw.streak ?? 0,
      best: raw.best ?? 0,
      solved: raw.date === today ? (raw.solved ?? 0) : 0,
    };
  } catch {
    return { streak: 0, best: 0, solved: 0 };
  }
}

export function PuzzleTrainer() {
  const { user } = useAuth();
  const [dbPuzzles, setDbPuzzles] = useState<Puzzle[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    supabase
      .from("puzzles")
      .select("id,fen,moves,theme,goal,rating,themes")
      .order("rating", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setDbPuzzles(
            (data as Record<string, unknown>[]).map((r) => ({
              id: String(r.id),
              fen: String(r.fen),
              moves: Array.isArray(r.moves) ? (r.moves as string[]) : String(r.moves).split(" "),
              theme: String(
                r.theme ??
                  (Array.isArray(r.themes) && r.themes.length > 0 ? r.themes[0] : "Tactics"),
              ),
              goal: String(r.goal ?? "Best move"),
              rating: Number(r.rating ?? 100),
            })),
          );
        }
      });
  }, []);

  const puzzleList = dbPuzzles.length > 0 ? dbPuzzles : PUZZLES;
  const puzzle = puzzleList[idx % puzzleList.length];
  const gameRef = useRef<Chess | null>(null);
  if (!gameRef.current) gameRef.current = new Chess(puzzle.fen);

  const [board, setBoard] = useState<BoardCell[][]>(gameRef.current.board());
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [status, setStatus] = useState<Status>("solving");
  const [flash, setFlash] = useState<"good" | "bad" | null>(null);
  const [progress, setProgress] = useState(loadProgress);
  const timers = useRef<number[]>([]);

  const playerColor = puzzle.fen.split(" ")[1] as "w" | "b";

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...progress, date: today }));
  }, [progress]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const sync = () => {
    setBoard(gameRef.current!.board());
    setSelected(null);
    setTargets([]);
  };

  const doFlash = (kind: "good" | "bad") => {
    setFlash(kind);
    timers.current.push(window.setTimeout(() => setFlash(null), 650));
  };

  const applyUci = (u: string) => {
    const made = gameRef.current!.move({
      from: u.slice(0, 2),
      to: u.slice(2, 4),
      promotion: u.length > 4 ? u[4] : undefined,
    });
    setLastMove({ from: made.from, to: made.to });
    return made;
  };

  const savePuzzleAttempt = (puzzleId: string, solved: boolean) => {
    if (!user || dbPuzzles.length === 0) return; // only save DB puzzles (UUIDs)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(puzzleId)) return;
    supabase
      .from("puzzle_attempts")
      .insert({
        user_id: user.id,
        puzzle_id: puzzleId,
        solved,
        puzzle_rating: puzzle.rating,
      } as never)
      .then(() => {});
  };

  const loadPuzzle = (nextIdx: number) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const p = puzzleList[nextIdx % puzzleList.length];
    gameRef.current = new Chess(p.fen);
    setIdx(nextIdx);
    setStep(0);
    setStatus("solving");
    setLastMove(null);
    setFlash(null);
    setBoard(gameRef.current.board());
    setSelected(null);
    setTargets([]);
  };

  const checkSquare = (() => {
    const g = gameRef.current!;
    if (!g.inCheck()) return null;
    const turn = g.turn();
    for (const row of board)
      for (const cell of row)
        if (cell && cell.type === "k" && cell.color === turn) return cell.square;
    return null;
  })();

  const onSquare = (sq: string) => {
    if (status !== "solving") return;
    const g = gameRef.current!;
    if (g.turn() !== playerColor) return;

    const piece = g.get(sq as Square);
    if (piece && piece.color === playerColor) {
      setSelected(sq);
      setTargets(g.moves({ square: sq as Square, verbose: true }).map((m) => m.to));
      return;
    }
    if (!selected) return;

    const expected = puzzle.moves[step];
    if (selected + sq === expected.slice(0, 4)) {
      applyUci(expected);
      sync();
      doFlash("good");
      if (step + 1 >= puzzle.moves.length) {
        setStatus("solved");
        setProgress((p) => ({
          streak: p.streak + 1,
          best: Math.max(p.best, p.streak + 1),
          solved: p.solved + 1,
        }));
        savePuzzleAttempt(puzzle.id, true);
        toast.success("Puzzle solved — brilliant! 👑");
      } else {
        const reply = puzzle.moves[step + 1];
        setStep(step + 2);
        timers.current.push(
          window.setTimeout(() => {
            applyUci(reply);
            sync();
          }, 500),
        );
      }
      return;
    }

    // Wrong attempt — if legal, flash red and take it back
    try {
      const made = g.move({ from: selected, to: sq, promotion: "q" });
      setLastMove({ from: made.from, to: made.to });
      sync();
      doFlash("bad");
      setProgress((p) => ({ ...p, streak: 0 }));
      toast.error("Not the best move — try again.");
      timers.current.push(
        window.setTimeout(() => {
          g.undo();
          setLastMove(null);
          sync();
        }, 700),
      );
    } catch {
      setSelected(null);
      setTargets([]);
    }
  };

  const showHint = () => {
    if (status !== "solving") return;
    const expected = puzzle.moves[step];
    setSelected(expected.slice(0, 2));
    setTargets([]);
    toast.info("The golden square marks the piece to move.");
  };

  const showSolution = () => {
    if (status !== "solving") return;
    setStatus("showing");
    let i = step;
    const playNext = () => {
      if (i >= puzzle.moves.length) {
        setStatus("revealed");
        savePuzzleAttempt(puzzle.id, false);
        setProgress((p) => ({ ...p, streak: 0 }));
        return;
      }
      applyUci(puzzle.moves[i]);
      sync();
      i += 1;
      timers.current.push(window.setTimeout(playNext, 800));
    };
    playNext();
  };

  const flashRing =
    flash === "good"
      ? "shadow-[0_0_0_4px_rgba(16,185,129,0.65)]"
      : flash === "bad"
        ? "shadow-[0_0_0_4px_rgba(239,68,68,0.65)]"
        : "";

  const pct = Math.min(100, Math.round((progress.solved / DAILY_GOAL) * 100));

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-3">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Puzzle Rating
          </div>
          <div className="font-display text-4xl text-gradient-gold">{puzzle.rating}</div>
          <div className="mt-1 text-xs text-muted-foreground">{puzzle.theme}</div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm">
            <Flame className="h-4 w-4 text-gold" /> Streak
          </div>
          <div className="mt-1 font-display text-3xl text-gold">{progress.streak} 🔥</div>
          <div className="text-xs text-muted-foreground">Personal best: {progress.best}</div>
        </Card>

        <Card className="p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Today</div>
          <div className="mt-2 flex justify-between text-sm">
            <span>Progress</span>
            <span className="text-gold">
              {progress.solved}/{DAILY_GOAL}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full gradient-gold transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </Card>
      </div>

      <div className="lg:col-span-6">
        <div className={`rounded-[30px] transition-shadow duration-300 ${flashRing}`}>
          <InteractiveBoard
            board={board}
            orientation={playerColor}
            selected={selected}
            targets={targets}
            lastMove={lastMove}
            checkSquare={checkSquare}
            onSquare={onSquare}
            disabled={status !== "solving"}
          />
        </div>
        <div className="mt-4 text-center text-sm text-muted-foreground">
          {status === "solved"
            ? "Solved! Load the next riddle."
            : status === "revealed"
              ? "Solution revealed — study the idea, then move on."
              : status === "showing"
                ? "Watch the winning sequence…"
                : `${playerColor === "w" ? "White" : "Black"} to move · ${puzzle.goal}`}
        </div>
      </div>

      <div className="space-y-4 lg:col-span-3">
        <Card className="p-5 text-center">
          <Target className="mx-auto h-7 w-7 text-gold" />
          <div className="mt-2 font-display text-lg">{puzzle.goal}</div>
          <div className="text-xs text-muted-foreground">
            Rated {puzzle.rating} · {puzzle.theme}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Puzzle {(idx % puzzleList.length) + 1} of {puzzleList.length}
          </div>
        </Card>
        <GhostButton className="w-full" onClick={showHint}>
          <Lightbulb className="h-4 w-4" /> Hint
        </GhostButton>
        <GhostButton className="w-full" onClick={showSolution}>
          <Eye className="h-4 w-4" /> Solution
        </GhostButton>
        <GoldButton className="w-full" onClick={() => loadPuzzle(idx + 1)}>
          Next Puzzle <ArrowRight className="h-4 w-4" />
        </GoldButton>
      </div>
    </div>
  );
}
