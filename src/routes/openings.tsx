import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Card, SectionTitle } from "@/components/site/Primitives";
import { Chessboard } from "@/components/site/Chessboard";

export const Route = createFileRoute("/openings")({
  head: () => ({ meta: [{ title: "Opening Explorer — ChessOx" }] }),
  component: Openings,
});

const LINES = [
  ["e4", "44%", "Open game", "1.2M games"],
  ["d4", "38%", "Closed game", "980K games"],
  ["c4", "8%", "English", "210K games"],
  ["Nf3", "7%", "Réti", "180K games"],
  ["g3", "2%", "King's Fianchetto", "32K games"],
];

const POPULAR = [
  ["Sicilian Defense", "B20", 52, 28, 20],
  ["Ruy Lopez", "C60", 48, 32, 20],
  ["Italian Game", "C50", 46, 30, 24],
  ["French Defense", "C00", 44, 34, 22],
  ["Caro-Kann", "B10", 42, 36, 22],
  ["King's Indian", "E60", 50, 30, 20],
];

function Openings() {
  return (
    <PageShell eyebrow="The Library" title="Opening Explorer" subtitle="Explore millions of master games — one move at a time.">
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Chessboard size="md" />
        </div>
        <div className="space-y-4 lg:col-span-7">
          <Card className="p-5">
            <SectionTitle kicker="Move" title="Database (1.e?)" />
            <div className="space-y-2">
              {LINES.map(([m, w, n, g]) => (
                <div key={m as string} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
                  <span className="font-mono text-gold">{m}</span>
                  <div>
                    <div>{n}</div>
                    <div className="text-xs text-muted-foreground">{g}</div>
                  </div>
                  <span className="rounded-full bg-emerald/15 px-2.5 py-1 text-xs text-emerald">{w}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle kicker="Trending" title="Popular Lines" />
            <div className="space-y-3">
              {POPULAR.map(([n, c, w, d, l]) => (
                <div key={n as string} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-display">{n} <span className="ml-1 text-xs text-muted-foreground">{c}</span></span>
                    <span className="text-xs text-muted-foreground">W {w}% · D {d}% · L {l}%</span>
                  </div>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full">
                    <div className="bg-emerald" style={{ width: `${w}%` }} />
                    <div className="bg-white/20" style={{ width: `${d}%` }} />
                    <div className="bg-destructive" style={{ width: `${l}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
