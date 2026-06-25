import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { Chessboard } from "@/components/site/Chessboard";
import { Timer, Zap, Trophy, RotateCw } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/puzzles/rush")({
  head: () => ({ meta: [{ title: "Puzzle Rush — ChessOx" }] }),
  component: Rush,
});

function Rush() {
  const [done, setDone] = useState(false);
  return (
    <PageShell eyebrow="3 Minutes of Royal Fury" title="Puzzle Rush">
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-6 lg:col-span-3">
          <div className="rounded-xl border border-gold/30 bg-gold/5 p-5 text-center">
            <Timer className="mx-auto h-6 w-6 text-gold" />
            <div className="mt-2 font-mono text-5xl text-gradient-gold">02:14</div>
            <div className="text-xs text-muted-foreground">remaining</div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
              <div className="text-xs text-muted-foreground">Score</div>
              <div className="font-display text-2xl text-gold">23</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
              <div className="text-xs text-muted-foreground">Combo</div>
              <div className="font-display text-2xl text-emerald">x4</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-white/5 p-3 text-xs text-muted-foreground">
            <div className="font-display text-sm text-foreground">Multiplier</div>
            Solve 5 in a row to enter <span className="text-gold">Maharaja Mode</span>.
          </div>

          <button onClick={() => setDone(true)} className="mt-6 w-full rounded-full border border-destructive/40 px-4 py-2 text-sm text-destructive">End Run</button>
        </Card>

        <div className="lg:col-span-6">
          <Chessboard size="lg" />
          <div className="mt-4 flex justify-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-4 w-4 text-gold" /> White to move — best move
          </div>
        </div>

        <Card className="p-6 lg:col-span-3">
          <div className="font-display">Recent</div>
          <ul className="mt-3 space-y-2 text-sm">
            {[["#23","✓","+1"],["#22","✓","+1"],["#21","✓","+1"],["#20","✗","x1"],["#19","✓","+1"]].map(([a,b,c]) => (
              <li key={a} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                <span className="text-muted-foreground">{a}</span>
                <span className={b === "✓" ? "text-emerald" : "text-destructive"}>{b}</span>
                <span className="text-gold">{c}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {done && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-md">
          <Card className="w-full max-w-md p-8 text-center">
            <Trophy className="mx-auto h-10 w-10 text-gold" />
            <h3 className="mt-2 font-display text-3xl text-gradient-gold">Maharaja Run!</h3>
            <div className="mt-1 text-muted-foreground">Final Score</div>
            <div className="font-display text-6xl text-gold">23</div>
            <div className="mt-2 text-sm text-muted-foreground">Personal best · Top 4% today</div>
            <div className="mt-6 flex justify-center gap-2">
              <GoldButton onClick={() => setDone(false)}><RotateCw className="h-4 w-4" /> Run Again</GoldButton>
              <Link to="/puzzles"><GhostButton>Exit</GhostButton></Link>
            </div>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
