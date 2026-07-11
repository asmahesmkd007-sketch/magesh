import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { InteractiveBoard, type BoardCell } from "@/components/site/InteractiveBoard";
import { Timer, Zap, Trophy, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { PUZZLES, type Puzzle } from "@/lib/chess/puzzles";
import { soundForChessMove } from "@/lib/audio/sounds";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/puzzles/rush")({
  head: () => ({ meta: [{ title: "Puzzle Rush — ChessOx" }] }),
  component: Rush,
});

const RUSH_SECONDS = 180;

type RushEntry = { num: number; solved: boolean };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Rush() {
  const { user } = useAuth();
  const [allPuzzles, setAllPuzzles] = useState<Puzzle[]>([]);
  const [shuffled, setShuffled] = useState<Puzzle[]>([]);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(RUSH_SECONDS);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [history, setHistory] = useState<RushEntry[]>([]);
  const gameRef = useRef<Chess | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    supabase
      .from("puzzles")
      .select("id,fen,moves,theme,goal,rating,themes")
      .limit(200)
      .then(({ data }) => {
        const base =
          data && data.length > 0
            ? (data as Record<string, unknown>[]).map((r) => ({
                id: String(r.id),
                fen: String(r.fen),
                moves: Array.isArray(r.moves) ? (r.moves as string[]) : String(r.moves).split(" "),
                theme: String(
                  r.theme ??
                    (Array.isArray(r.themes) && r.themes.length > 0 ? r.themes[0] : "Tactics"),
                ),
                goal: String(r.goal ?? "Best move"),
                rating: Number(r.rating ?? 100),
              }))
            : PUZZLES;
        setAllPuzzles(base);
      });
  }, []);

  const puzzle = shuffled[puzzleIdx];
  const board: BoardCell[][] =
    gameRef.current?.board() ??
    Array(8)
      .fill(null)
      .map(() => Array(8).fill(null));
  const playerColor = puzzle ? (puzzle.fen.split(" ")[1] as "w" | "b") : "w";

  function startRush() {
    const s = shuffle(allPuzzles.length > 0 ? allPuzzles : PUZZLES);
    setShuffled(s);
    const g = new Chess(s[0].fen);
    gameRef.current = g;
    setStarted(true);
    setDone(false);
    setScore(0);
    setCombo(0);
    setPuzzleIdx(0);
    setStep(0);
    setHistory([]);
    setTimeLeft(RUSH_SECONDS);
    setSelected(null);
    setTargets([]);
    setLastMove(null);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (timerInterval.current) clearInterval(timerInterval.current);
    timerInterval.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          endRush();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  function endRush() {
    if (timerInterval.current) clearInterval(timerInterval.current);
    timers.current.forEach(clearTimeout);
    setDone(true);
  }

  function nextPuzzle(solved: boolean) {
    setHistory((h) => [...h, { num: puzzleIdx + 1, solved }]);
    const nextIdx = puzzleIdx + 1;
    if (nextIdx >= shuffled.length) {
      endRush();
      return;
    }
    const p = shuffled[nextIdx];
    gameRef.current = new Chess(p.fen);
    setPuzzleIdx(nextIdx);
    setStep(0);
    setSelected(null);
    setTargets([]);
    setLastMove(null);
  }

  function onSquare(sq: string) {
    if (!puzzle || !gameRef.current) return;
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
      const m = g.move({
        from: selected,
        to: sq,
        promotion: expected[4] as "q" | "r" | "b" | "n" | undefined,
      });
      setLastMove({ from: m.from, to: m.to });
      soundForChessMove(m, g);
      setSelected(null);
      setTargets([]);

      if (step + 1 >= puzzle.moves.length) {
        const newCombo = combo + 1;
        setCombo(newCombo);
        setScore((s) => s + 1 + Math.floor(newCombo / 5));
        timers.current.push(setTimeout(() => nextPuzzle(true), 400));
      } else {
        const reply = puzzle.moves[step + 1];
        setStep(step + 2);
        timers.current.push(
          setTimeout(() => {
            if (!gameRef.current) return;
            const rm = gameRef.current.move({
              from: reply.slice(0, 2),
              to: reply.slice(2, 4),
              promotion: reply[4] as "q" | undefined,
            });
            setLastMove({ from: rm.from, to: rm.to });
            soundForChessMove(rm, gameRef.current);
            setSelected(null);
            setTargets([]);
          }, 500),
        );
      }
    } else {
      try {
        const m = g.move({ from: selected, to: sq, promotion: "q" });
        setLastMove({ from: m.from, to: m.to });
        setSelected(null);
        setTargets([]);
        setCombo(0);
        toast.error("Wrong move");
        timers.current.push(
          setTimeout(() => {
            g.undo();
            setLastMove(null);
            setSelected(null);
            setTargets([]);
          }, 600),
        );
      } catch {
        setSelected(null);
        setTargets([]);
      }
    }
  }

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const recentHistory = [...history].reverse().slice(0, 6);

  useEffect(
    () => () => {
      if (timerInterval.current) clearInterval(timerInterval.current);
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  if (!started) {
    return (
      <PageShell eyebrow="3 Minutes of Royal Fury" title="Puzzle Rush">
        <Card className="mx-auto max-w-md p-10 text-center">
          <Zap className="mx-auto h-10 w-10 text-gold" />
          <h2 className="mt-4 font-display text-3xl">Ready to Rush?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Solve as many puzzles as you can in 3 minutes. Combos give bonus points.
          </p>
          <div className="mt-8">
            <GoldButton onClick={startRush}>
              <Timer className="h-4 w-4" /> Start Rush
            </GoldButton>
          </div>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="3 Minutes of Royal Fury" title="Puzzle Rush">
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-6 lg:col-span-3">
          <div className="rounded-xl border border-gold/30 bg-gold/5 p-5 text-center">
            <Timer className="mx-auto h-6 w-6 text-gold" />
            <div
              className={`mt-2 font-mono text-5xl text-gradient-gold ${timeLeft <= 30 ? "text-destructive" : ""}`}
            >
              {fmtTime(timeLeft)}
            </div>
            <div className="text-xs text-muted-foreground">remaining</div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
              <div className="text-xs text-muted-foreground">Score</div>
              <div className="font-display text-2xl text-gold">{score}</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
              <div className="text-xs text-muted-foreground">Combo</div>
              <div className={`font-display text-2xl ${combo >= 5 ? "text-gold" : "text-emerald"}`}>
                x{combo}
              </div>
            </div>
          </div>
          {combo >= 5 && (
            <div className="mt-4 rounded-xl border border-gold/30 bg-gold/5 p-3 text-center text-xs text-gold">
              ♛ Maharaja Mode! +{Math.floor(combo / 5)} bonus per solve
            </div>
          )}
          <button
            onClick={endRush}
            className="mt-6 w-full rounded-full border border-destructive/40 px-4 py-2 text-sm text-destructive"
          >
            End Run
          </button>
        </Card>

        <div className="lg:col-span-6">
          {puzzle && (
            <>
              <InteractiveBoard
                board={board}
                orientation={playerColor}
                selected={selected}
                targets={targets}
                lastMove={lastMove}
                checkSquare={null}
                onSquare={onSquare}
              />
              <div className="mt-4 flex justify-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4 text-gold" /> {playerColor === "w" ? "White" : "Black"} to
                move — {puzzle.goal}
              </div>
            </>
          )}
        </div>

        <Card className="p-6 lg:col-span-3">
          <div className="font-display">Recent</div>
          <ul className="mt-3 space-y-2 text-sm">
            {recentHistory.map((h) => (
              <li
                key={h.num}
                className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <span className="text-muted-foreground">#{h.num}</span>
                <span className={h.solved ? "text-emerald" : "text-destructive"}>
                  {h.solved ? "✓" : "✗"}
                </span>
                <span className="text-gold">{h.solved ? "+1" : "×1"}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 text-xs text-muted-foreground">Puzzle {puzzleIdx + 1}</div>
        </Card>
      </div>

      {done && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-md">
          <Card className="w-full max-w-md p-8 text-center">
            <Trophy className="mx-auto h-10 w-10 text-gold" />
            <h3 className="mt-2 font-display text-3xl text-gradient-gold">Maharaja Run!</h3>
            <div className="mt-1 text-muted-foreground">Final Score</div>
            <div className="font-display text-6xl text-gold">{score}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {history.filter((h) => h.solved).length} solved · {history.length} attempted
            </div>
            {user && (
              <div className="mt-2 text-xs text-muted-foreground">Score saved to your profile</div>
            )}
            <div className="mt-6 flex justify-center gap-2">
              <GoldButton onClick={startRush}>
                <RotateCw className="h-4 w-4" /> Run Again
              </GoldButton>
              <Link to="/puzzles">
                <GhostButton>Exit</GhostButton>
              </Link>
            </div>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
