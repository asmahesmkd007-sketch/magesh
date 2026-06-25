import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Card, GoldButton, SectionTitle } from "@/components/site/Primitives";
import { Crown, Calendar, Users, Trophy, IndianRupee } from "lucide-react";
import { relativeLabel, shortDate } from "@/lib/dates";

export const Route = createFileRoute("/tournament")({
  head: () => ({ meta: [{ title: "Maharaja Cup — ChessOx" }] }),
  component: T,
});

const LEAD = [
  ["GM Carlsen, Magnus", "🇳🇴", 9.5, 11],
  ["GM Gukesh, Dommaraju", "🇮🇳", 9.0, 11],
  ["GM Caruana, Fabiano", "🇺🇸", 8.5, 11],
  ["GM Erigaisi, Arjun", "🇮🇳", 8.5, 11],
  ["GM Praggnanandhaa", "🇮🇳", 8.0, 11],
  ["GM Nakamura, Hikaru", "🇺🇸", 7.5, 11],
];

function T() {
  return (
    <PageShell>
      <Card className="relative overflow-hidden p-8 md:p-14">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/30 via-rose-700/20 to-transparent" />
        <div className="pointer-events-none absolute inset-0 mandala-bg opacity-50" />
        <div className="relative">
          <div className="font-display text-xs uppercase tracking-[0.3em] text-gold">Royal Championship</div>
          <h1 className="mt-2 font-display text-5xl md:text-7xl">Maharaja Cup 2026</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">A 12-day knockout featuring 64 of the world's finest. Played on rosewood, decided by gold.</p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-gold"><IndianRupee className="h-4 w-4" />10,00,000 Prize Pool</span>
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5"><Calendar className="h-4 w-4" /> {shortDate(0)} – {shortDate(12)}</span>
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5"><Users className="h-4 w-4" /> 64 players</span>
          </div>
          <div className="mt-6"><GoldButton><Crown className="h-4 w-4" /> Register Now</GoldButton></div>
        </div>
      </Card>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <SectionTitle kicker="Standings" title="Leaderboard" />
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-widest text-muted-foreground">
              <tr><th className="py-2 text-left">#</th><th className="text-left">Player</th><th className="text-right">Pts</th><th className="text-right">Games</th></tr>
            </thead>
            <tbody>
              {LEAD.map(([n, c, p, g], i) => (
                <tr key={n as string} className="border-t border-white/5">
                  <td className="py-3">
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-xs ${i<3 ? "gradient-gold text-[#0B0D10]" : "bg-white/5"}`}>{i+1}</span>
                  </td>
                  <td>{n} <span className="ml-1">{c}</span></td>
                  <td className="text-right font-display text-gold">{p}</td>
                  <td className="text-right text-muted-foreground">{g}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          <Card className="p-6">
            <SectionTitle kicker="Schedule" title="Next Round" />
            <ul className="space-y-2 text-sm">
              {[[`R7 · ${relativeLabel(0)}`, "19:00"],[`R8 · ${relativeLabel(1)}`, "19:00"],[`R9 · ${relativeLabel(3)} (${shortDate(3)})`, "19:00"]].map(([r,t]) => (
                <li key={r} className="flex justify-between rounded-lg border border-white/5 px-3 py-2"><span>{r}</span><span className="text-gold">{t}</span></li>
              ))}
            </ul>
          </Card>

          <Card className="p-6">
            <SectionTitle kicker="Format" title="Rules" />
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>• Rapid (15+10), 11 rounds Swiss</li>
              <li>• Top 8 advance to knockout</li>
              <li>• Tiebreaks: Buchholz, Sonneborn</li>
              <li>• Fair play monitoring on all games</li>
            </ul>
          </Card>

          <Card className="p-6">
            <SectionTitle kicker="Prize" title="Distribution" />
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between"><span><Trophy className="mr-1 inline h-3.5 w-3.5 text-gold" /> 1st</span><span className="text-gold">₹4,00,000</span></li>
              <li className="flex justify-between"><span>2nd</span><span>₹2,50,000</span></li>
              <li className="flex justify-between"><span>3rd</span><span>₹1,50,000</span></li>
              <li className="flex justify-between text-muted-foreground"><span>4-8</span><span>₹40,000 each</span></li>
            </ul>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
