import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Card, GoldButton, SectionTitle } from "@/components/site/Primitives";
import { Users, Trophy, MessageSquare, Megaphone } from "lucide-react";

export const Route = createFileRoute("/club")({
  head: () => ({ meta: [{ title: "Mumbai Knights — ChessOx" }] }),
  component: Club,
});

function Club() {
  return (
    <PageShell>
      <Card className="overflow-hidden">
        <div className="relative h-48 bg-gradient-to-br from-amber-500/40 via-rose-700/40 to-orange-700/40 md:h-64">
          <div className="absolute inset-0 mandala-bg opacity-60" />
        </div>
        <div className="relative -mt-12 p-6 md:p-8">
          <div className="flex flex-wrap items-end gap-5">
            <div className="grid h-24 w-24 place-items-center rounded-2xl gradient-gold font-display text-3xl text-[#0B0D10] ring-4 ring-background">
              MK
            </div>
            <div className="flex-1">
              <h1 className="font-display text-4xl">Mumbai Knights</h1>
              <div className="mt-1 text-sm text-muted-foreground">
                Maharashtra · Founded 2018 · 1,240 members
              </div>
            </div>
            <GoldButton>
              <Users className="h-4 w-4" /> Join Club
            </GoldButton>
          </div>
        </div>
      </Card>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="p-6">
          <SectionTitle kicker="Court" title="Members" />
          <div className="grid grid-cols-4 gap-2">
            {["AM", "PV", "RK", "SN", "TT", "VB", "NS", "GP"].map((m) => (
              <div
                key={m}
                className="aspect-square grid place-items-center rounded-lg bg-gold/10 text-sm text-gold"
              >
                {m}
              </div>
            ))}
          </div>
          <button className="mt-4 w-full text-xs text-gold">View all 1,240 →</button>
        </Card>

        <Card className="p-6">
          <SectionTitle kicker="Battles" title="Club Matches" />
          <ul className="space-y-3 text-sm">
            {[
              ["vs Delhi Diamonds", "Live · 18-14"],
              ["vs Kolkata Castles", "Won 22-10"],
              ["vs Chennai Champions", "Lost 14-18"],
            ].map(([t, r]) => (
              <li key={t} className="flex items-center gap-2 rounded-lg border border-white/5 p-3">
                <Trophy className="h-4 w-4 text-gold" />
                <div className="flex-1">
                  <div className="font-display">{t}</div>
                  <div className="text-xs text-muted-foreground">{r}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <SectionTitle kicker="From Captain" title="Announcements" />
          <ul className="space-y-3 text-sm">
            {[
              ["Weekly meet this Saturday 7pm IST. Be there!", "2d"],
              ["New club ranking system rolling out", "5d"],
              ["Welcome our 1000th member 🎉", "1w"],
            ].map(([t, w]) => (
              <li key={t} className="rounded-lg border border-white/5 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Megaphone className="h-3.5 w-3.5 text-gold" /> Captain · {w} ago
                </div>
                <div className="mt-1">{t}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <SectionTitle kicker="Live" title="Club Chat" />
        <div className="h-64 space-y-3 overflow-y-auto rounded-lg bg-white/[0.02] p-4 scrollbar-thin">
          {[
            ["Captain", "Round 3 pairings up!"],
            ["PriyaQ", "Let's go Knights!"],
            ["AM", "On my way 💪"],
            ["TT", "Good luck team."],
          ].map(([u, m], i) => (
            <div key={i} className="text-sm">
              <span className="text-gold">{u}:</span> {m}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 text-sm outline-none focus:border-gold/40"
            placeholder="Message the club…"
          />
          <button className="rounded-full gradient-gold px-5 py-2 text-sm font-medium text-[#0B0D10]">
            Send
          </button>
        </div>
      </Card>
    </PageShell>
  );
}
