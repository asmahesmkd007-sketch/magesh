import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Card } from "@/components/site/Primitives";
import { useState } from "react";
import { Crown } from "lucide-react";

export const Route = createFileRoute("/leaderboards")({
  head: () => ({ meta: [{ title: "Leaderboards — ChessOx" }] }),
  component: LB,
});

const DATA = [
  ["Carlsen, Magnus", "🇳🇴", 2839, 1240, 68],
  ["Caruana, Fabiano", "🇺🇸", 2790, 980, 65],
  ["Nepomniachtchi, Ian", "🇷🇺", 2770, 1100, 62],
  ["Anand, Viswanathan", "🇮🇳", 2754, 1380, 70],
  ["Gukesh, Dommaraju", "🇮🇳", 2750, 820, 71],
  ["Erigaisi, Arjun", "🇮🇳", 2730, 760, 69],
  ["Praggnanandhaa, R.", "🇮🇳", 2722, 690, 66],
  ["Nakamura, Hikaru", "🇺🇸", 2802, 1900, 64],
  ["Ding, Liren", "🇨🇳", 2780, 720, 63],
  ["Vidit, Gujrathi", "🇮🇳", 2715, 540, 67],
];

const TABS = ["Global","India","State","Club"] as const;

function LB() {
  const [tab, setTab] = useState<typeof TABS[number]>("Global");
  return (
    <PageShell eyebrow="Hall of Kings" title="Leaderboards" subtitle="Where royalty is ranked, and legends are born.">
      <div className="mb-6 inline-flex rounded-full border border-white/10 bg-white/[0.02] p-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-2 text-sm transition-colors ${tab === t ? "gradient-gold text-[#0B0D10]" : "text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Rank</th>
              <th className="px-4 py-3 text-left">Player</th>
              <th className="px-4 py-3 text-right">Rating</th>
              <th className="hidden px-4 py-3 text-right md:table-cell">Games</th>
              <th className="hidden px-4 py-3 text-right md:table-cell">Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {DATA.map(([n, c, r, g, w], i) => (
              <tr key={n as string} className="border-t border-white/5 hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-xs ${i<3 ? "gradient-gold text-[#0B0D10]" : "bg-white/5"}`}>{i+1}</span>
                    {i === 0 && <Crown className="h-4 w-4 text-gold" />}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-gold/10 text-xs text-gold">{(n as string)[0]}</span>
                    <div>
                      <div>{n}</div>
                      <div className="text-xs text-muted-foreground">{c}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-display text-gold">{r}</td>
                <td className="hidden px-4 py-3 text-right text-muted-foreground md:table-cell">{g}</td>
                <td className="hidden px-4 py-3 text-right md:table-cell">{w}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
