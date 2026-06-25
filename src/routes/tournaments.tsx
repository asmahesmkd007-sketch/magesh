import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, SectionTitle } from "@/components/site/Primitives";
import { Trophy, Crown, Calendar, Users } from "lucide-react";
import { relativeLabel, shortDate } from "@/lib/dates";

export const Route = createFileRoute("/tournaments")({
  head: () => ({ meta: [{ title: "Tournaments — ChessOx" }] }),
  component: Tournaments,
});

const UPCOMING = [
  { name: "Maharaja Cup 2026", format: "Knockout", prize: "₹10,00,000", daysFromNow: 1, time: "19:00 IST", players: 2400, gradient: "from-amber-500 to-rose-700" },
  { name: "Brass Blitz Open", format: "Arena", prize: "₹2,50,000", daysFromNow: 5, time: "21:00 IST", players: 800, gradient: "from-emerald-500 to-teal-700" },
  { name: "Mandala Masters", format: "Swiss", prize: "₹5,00,000", daysFromNow: 9, time: "18:00 IST", players: 1600, gradient: "from-violet-500 to-indigo-700" },
];

const LIVE = [
  ["Friday Night Royal", "Arena", "Live now · 2,134 players"],
  ["Sicilian Showdown", "Swiss", "Live now · 480 players"],
];

const COMPLETED = [
  ["Diwali Classic", "Knockout", "GM Erigaisi A.", "₹5,00,000"],
  ["Republic Rapid", "Arena", "GM Gukesh D.", "₹3,00,000"],
  ["Holi Hattrick", "Swiss", "IM Vaishali R.", "₹1,50,000"],
];

function Tournaments() {
  return (
    <PageShell eyebrow="The Royal Arena" title="Tournaments" subtitle="From Friday night arenas to royal championships, the throne is contested daily.">
      <SectionTitle kicker="Upcoming" title="Coming up" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {UPCOMING.map((t) => (
          <Link to="/tournament" key={t.name}>
            <Card className="overflow-hidden transition-transform hover:-translate-y-1">
              <div className={`relative aspect-[16/9] bg-gradient-to-br ${t.gradient}`}>
                <div className="absolute inset-0 mandala-bg opacity-50" />
                <Crown className="absolute right-4 top-4 h-6 w-6 text-white/80" />
                <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                  <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs backdrop-blur">{t.format}</span>
                  <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs text-gold backdrop-blur">{relativeLabel(t.daysFromNow)}</span>
                </div>
              </div>
              <div className="p-5">
                <div className="font-display text-xl">{t.name}</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" /> {relativeLabel(t.daysFromNow)} · {shortDate(t.daysFromNow)} · {t.time}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-display text-gold">{t.prize}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> {t.players}</span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <SectionTitle kicker="Live" title="Now playing" />
      <div className="grid gap-3 md:grid-cols-2">
        {LIVE.map(([n, t, d]) => (
          <Card key={n} className="flex items-center justify-between p-5">
            <div>
              <div className="font-display text-lg">{n}</div>
              <div className="text-xs text-muted-foreground">{t}</div>
            </div>
            <span className="rounded-full bg-emerald/20 px-3 py-1 text-xs text-emerald">● {d}</span>
          </Card>
        ))}
      </div>

      <SectionTitle kicker="Archive" title="Completed events" />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-widest text-muted-foreground">
            <tr><th className="px-4 py-3 text-left">Event</th><th className="px-4 py-3 text-left">Format</th><th className="px-4 py-3 text-left">Winner</th><th className="px-4 py-3 text-left">Prize</th></tr>
          </thead>
          <tbody>
            {COMPLETED.map(([n,t,w,p]) => (
              <tr key={n} className="border-t border-white/5">
                <td className="px-4 py-3 font-display">{n}</td>
                <td className="px-4 py-3 text-muted-foreground">{t}</td>
                <td className="px-4 py-3"><span className="flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-gold" />{w}</span></td>
                <td className="px-4 py-3 text-gold">{p}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
