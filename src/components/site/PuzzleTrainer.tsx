import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { toast } from "sonner";
import { ArrowRight, Eye, Flame, Lightbulb, Target, Clock, Loader2, Lock } from "lucide-react";
import { Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { InteractiveBoard, type BoardCell } from "@/components/site/InteractiveBoard";
import { difficultyOf } from "@/lib/chess/puzzles";
import { useAuth } from "@/hooks/useAuth";
import { soundForChessMove } from "@/lib/audio/sounds";
import { useDailyPuzzle, type PuzzleStatus } from "@/hooks/useDailyPuzzle";
import { Link } from "@tanstack/react-router";

const DAILY_GOAL = 3;

export function PuzzleTrainer() {
  const { user } = useAuth();
  const {
    puzzle,
    progress,
    stats,
    locked,
    remainingToday,
    loading,
    error,
    fetchDailyPuzzle,
    updateProgress,
  } = useDailyPuzzle();

  const gameRef = useRef<Chess | null>(null);
  const [board, setBoard] = useState<BoardCell[][]>([]);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [localStatus, setLocalStatus] = useState<PuzzleStatus | "SHOWING">("NOT_STARTED");
  const [flash, setFlash] = useState<"good" | "bad" | null>(null);
  const [wrongMoves, setWrongMoves] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const startTime = useRef<number>(Date.now());
  const timers = useRef<number[]>([]);

  // Timer state for countdown
  const [timeLeft, setTimeLeft] = useState<string>("--");

  useEffect(() => {
    return () => timers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (locked && stats?.daily_reset_time) {
      const interval = setInterval(() => {
        const diff = new Date(stats.daily_reset_time).getTime() - Date.now();
        if (diff <= 0) {
          setTimeLeft("00:00:00");
          clearInterval(interval);
          // Unlock automatically
          fetchDailyPuzzle();
        } else {
          const h = Math.floor(diff / 3600000)
            .toString()
            .padStart(2, "0");
          const m = Math.floor((diff % 3600000) / 60000)
            .toString()
            .padStart(2, "0");
          const s = Math.floor((diff % 60000) / 1000)
            .toString()
            .padStart(2, "0");
          setTimeLeft(`${h}:${m}:${s}`);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [locked, stats?.daily_reset_time, fetchDailyPuzzle]);

  useEffect(() => {
    if (puzzle && progress) {
      gameRef.current = new Chess(progress.board_fen || puzzle.fen);
      setBoard(gameRef.current.board());
      setStep(progress.step_index);
      setLocalStatus(progress.status === "NOT_STARTED" ? "IN_PROGRESS" : progress.status);
      setWrongMoves(progress.wrong_moves_count);
      setHintUsed(progress.hint_used);
      startTime.current = Date.now();

      if (progress.last_move_played) {
        setLastMove({
          from: progress.last_move_played.slice(0, 2),
          to: progress.last_move_played.slice(2, 4),
        });
      } else {
        setLastMove(null);
      }
    }
  }, [puzzle, progress]);

  if (!user) {
    return (
      <div className="grid place-items-center py-20">
        <div className="text-center">
          <Lock className="mx-auto h-12 w-12 text-gold/50 mb-4" />
          <h2 className="text-2xl font-display mb-2">Sign in to train</h2>
          <p className="text-muted-foreground mb-6">
            Puzzle progress is permanently tracked for all users.
          </p>
          <Link to="/auth">
            <GoldButton>Sign In</GoldButton>
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid h-[60vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  if (error) {
    return <div className="grid h-[60vh] place-items-center text-rose-500">{error}</div>;
  }

  const sync = () => {
    if (!gameRef.current) return;
    setBoard(gameRef.current.board());
    setSelected(null);
    setTargets([]);
  };

  const doFlash = (kind: "good" | "bad") => {
    setFlash(kind);
    timers.current.push(window.setTimeout(() => setFlash(null), 650));
  };

  const applyUci = (u: string) => {
    if (!gameRef.current) return null;
    const made = gameRef.current.move({
      from: u.slice(0, 2),
      to: u.slice(2, 4),
      promotion: u.length > 4 ? u[4] : undefined,
    });
    setLastMove({ from: made.from, to: made.to });
    soundForChessMove(made, gameRef.current);
    return made;
  };

  const getTimeSpent = () => (progress?.time_spent_ms || 0) + (Date.now() - startTime.current);

  const checkSquare = (() => {
    const g = gameRef.current;
    if (!g || !g.inCheck()) return null;
    const turn = g.turn();
    for (const row of board)
      for (const cell of row)
        if (cell && cell.type === "k" && cell.color === turn) return cell.square;
    return null;
  })();

  const onSquare = (sq: string) => {
    if (!puzzle || localStatus !== "IN_PROGRESS" || !gameRef.current) return;
    const playerColor = puzzle.fen.split(" ")[1] as "w" | "b";
    const g = gameRef.current;

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

      const newStep = step + 1;
      let nextStatus: PuzzleStatus = "IN_PROGRESS";

      if (newStep >= puzzle.moves.length) {
        nextStatus = "SOLVED";
        setLocalStatus("SOLVED");
        toast.success("Puzzle solved — brilliant! 👑");
        timers.current.push(
          window.setTimeout(() => {
            fetchDailyPuzzle();
          }, 1500),
        );
      }

      updateProgress({
        status: nextStatus,
        time_spent_ms: getTimeSpent(),
        board_fen: g.fen(),
        step_index: newStep,
        wrong_moves_count: wrongMoves,
        hint_used: hintUsed,
        last_move_played: expected,
      });

      if (nextStatus === "IN_PROGRESS") {
        const reply = puzzle.moves[newStep];
        setStep(newStep + 1);
        timers.current.push(
          window.setTimeout(() => {
            applyUci(reply);
            sync();
            updateProgress({
              status: "IN_PROGRESS",
              time_spent_ms: getTimeSpent(),
              board_fen: g.fen(),
              step_index: newStep + 1,
              wrong_moves_count: wrongMoves,
              hint_used: hintUsed,
              last_move_played: reply,
            });
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
      setWrongMoves((w) => w + 1);
      toast.error("Not the best move — try again.");

      updateProgress({
        status: "FAILED",
        time_spent_ms: getTimeSpent(),
        board_fen: g.fen(),
        step_index: step,
        wrong_moves_count: wrongMoves + 1,
        hint_used: hintUsed,
        last_move_played: made.from + made.to,
      });
      setLocalStatus("FAILED");

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
    if (!puzzle || localStatus !== "IN_PROGRESS") return;
    const expected = puzzle.moves[step];
    setSelected(expected.slice(0, 2));
    setTargets([]);
    setHintUsed(true);
    toast.info("The golden square marks the piece to move.");
    updateProgress({
      status: "IN_PROGRESS",
      time_spent_ms: getTimeSpent(),
      board_fen: gameRef.current!.fen(),
      step_index: step,
      wrong_moves_count: wrongMoves,
      hint_used: true,
      last_move_played: progress?.last_move_played || null,
    });
  };

  const showSolution = () => {
    if (!puzzle || localStatus !== "IN_PROGRESS") return;
    setLocalStatus("SHOWING");

    // Mark as skipped/failed
    updateProgress({
      status: "SKIPPED",
      time_spent_ms: getTimeSpent(),
      board_fen: gameRef.current!.fen(),
      step_index: step,
      wrong_moves_count: wrongMoves,
      hint_used: hintUsed,
      last_move_played: null,
    });

    let i = step;
    const playNext = () => {
      if (i >= puzzle.moves.length) {
        setLocalStatus("SKIPPED");
        return;
      }
      applyUci(puzzle.moves[i]);
      sync();
      i += 1;
      timers.current.push(window.setTimeout(playNext, 800));
    };
    playNext();
  };

  const pct = Math.min(100, Math.round(((stats?.completed_today || 0) / DAILY_GOAL) * 100));

  if (locked) {
    return (
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <Card className="p-10 text-center relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 mandala-bg opacity-10" />
            <Clock className="mx-auto h-16 w-16 text-gold mb-6" />
            <h2 className="font-display text-4xl mb-4">Daily Limit Reached</h2>
            <p className="text-lg text-muted-foreground mb-8">
              You have completed today's 3 puzzles.
              <br />
              Next puzzles unlock in:
            </p>
            <div className="font-mono text-5xl text-gradient-gold mb-8 font-bold">{timeLeft}</div>

            <div className="max-w-md mx-auto grid grid-cols-3 gap-4 text-sm mt-8 border-t border-gold/10 pt-8">
              <div>
                <div className="text-muted-foreground mb-1">Solved Today</div>
                <div className="text-2xl text-emerald-400 font-bold">
                  {stats?.completed_today} / {DAILY_GOAL}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Current Streak</div>
                <div className="text-2xl text-gold font-bold">{stats?.current_streak} 🔥</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Total Solved</div>
                <div className="text-2xl text-white font-bold">{stats?.total_solved}</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!puzzle) {
    return (
      <div className="grid h-[60vh] place-items-center">
        <Card className="p-10 text-center max-w-md w-full relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 mandala-bg opacity-10" />
          <Target className="mx-auto h-16 w-16 text-emerald-500 mb-6" />
          <h2 className="font-display text-3xl mb-2 text-emerald-400">All Done!</h2>
          <p className="text-muted-foreground mb-8">
            You have completed all the puzzles currently available in the system. Great job! Check
            back later for more.
          </p>
          <div className="flex justify-center">
            <Link to="/puzzles/rush">
              <GoldButton>Try Puzzle Rush</GoldButton>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const playerColor = puzzle.fen.split(" ")[1] as "w" | "b";
  const flashRing =
    flash === "good"
      ? "shadow-[0_0_0_4px_rgba(16,185,129,0.65)]"
      : flash === "bad"
        ? "shadow-[0_0_0_4px_rgba(239,68,68,0.65)]"
        : "";
  const isMate =
    (localStatus === "SOLVED" || localStatus === "SKIPPED") && !!gameRef.current?.isCheckmate();
  const difficulty: string = puzzle.difficulty ?? difficultyOf(puzzle.rating) ?? "Intermediate";
  const DIFF_COLOR: Record<string, string> = {
    Easy: "text-emerald-400",
    Beginner: "text-teal-400",
    Intermediate: "text-sky-400",
    Advanced: "text-amber-400",
    Expert: "text-orange-400",
    Master: "text-rose-400",
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-3">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Puzzle Rating
          </div>
          <div className="font-display text-4xl text-gradient-gold">{puzzle.rating}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`font-semibold ${DIFF_COLOR[difficulty] ?? "text-gold"}`}>
              {difficulty}
            </span>
            · {puzzle.theme}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm">
            <Flame className="h-4 w-4 text-gold" /> Streak
          </div>
          <div className="mt-1 font-display text-3xl text-gold">
            {stats?.current_streak || 0} 🔥
          </div>
          <div className="text-xs text-muted-foreground">
            Personal best: {stats?.longest_streak || 0}
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Today's Progress
          </div>
          <div className="mt-4 flex gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex-1 h-2 rounded-full ${i <= (stats?.completed_today || 0) ? "bg-gold" : "bg-white/10"}`}
              />
            ))}
          </div>
          <div className="mt-4 text-xs text-muted-foreground">
            Remaining Today:{" "}
            <span className="text-gold font-bold">
              {remainingToday} / {DAILY_GOAL}
            </span>
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
            disabled={localStatus !== "IN_PROGRESS"}
          />
        </div>
        <div className="mt-4 text-center text-sm">
          {localStatus === "SOLVED" ? (
            <span className="font-display text-lg text-emerald-400">
              {isMate ? "✔ Checkmate!" : "✔ Correct — puzzle solved!"} 👑
            </span>
          ) : localStatus === "FAILED" ? (
            <span className="font-display text-lg text-rose-500">
              ❌ Incorrect — attempt failed.
            </span>
          ) : localStatus === "SKIPPED" ? (
            <span className="text-muted-foreground">
              Solution revealed — study the idea, then move on.
            </span>
          ) : localStatus === "SHOWING" ? (
            <span className="text-muted-foreground">Watch the winning sequence…</span>
          ) : (
            <span className="text-muted-foreground">
              {playerColor === "w" ? "White" : "Black"} to move · {puzzle.goal}
            </span>
          )}
        </div>

        {(localStatus === "SOLVED" || localStatus === "SKIPPED" || localStatus === "FAILED") && (
          <div className="mt-4 rounded-2xl border border-gold/20 bg-gold/5 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gold">
              <Lightbulb className="h-3.5 w-3.5" /> {puzzle.theme}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {puzzle.explanation || "Study how the pieces coordinate to force the win."}
            </p>
            <div className="mt-2 text-xs text-muted-foreground/70">
              Solution: {puzzle.moves.filter((_, i) => i % 2 === 0).join("  ")}
            </div>
            <GoldButton className="mt-3 w-full" onClick={() => fetchDailyPuzzle()}>
              Next Puzzle <ArrowRight className="h-4 w-4" />
            </GoldButton>
          </div>
        )}
      </div>

      <div className="space-y-4 lg:col-span-3">
        <Card className="p-5 text-center">
          <Target className="mx-auto h-7 w-7 text-gold" />
          <div className="mt-2 font-display text-lg">{puzzle.goal}</div>
          <div className="text-xs text-muted-foreground">
            Rated {puzzle.rating} · {puzzle.theme}
          </div>
        </Card>

        {localStatus === "IN_PROGRESS" && (
          <>
            <GhostButton className="w-full" onClick={showHint}>
              <Lightbulb className="h-4 w-4" /> Hint
            </GhostButton>
            <GhostButton className="w-full" onClick={showSolution}>
              <Eye className="h-4 w-4" /> Show Solution
            </GhostButton>
          </>
        )}
      </div>
    </div>
  );
}
