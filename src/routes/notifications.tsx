import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Card, SectionTitle } from "@/components/site/Primitives";
import { Trophy, UserPlus, Users, Flame } from "lucide-react";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — ChessOx" }] }),
  component: Notifs,
});

const GROUPS = [
  { title: "Tournament Updates", icon: Trophy, items: [
    ["Maharaja Cup starts in 2 hours", "now"],
    ["You advanced to Round 4 of Brass Blitz", "1d"],
  ]},
  { title: "Friend Requests", icon: UserPlus, items: [
    ["PriyaQueen wants to add you", "2h"],
    ["NajdorfNinja sent a friend request", "1d"],
  ]},
  { title: "Club Updates", icon: Users, items: [
    ["Mumbai Knights vs Delhi Diamonds tonight", "4h"],
    ["You were promoted to Club Officer", "3d"],
  ]},
  { title: "Puzzle Streak Alerts", icon: Flame, items: [
    ["Don't break your 7-day streak!", "6h"],
    ["New personal best: 28 puzzle rush", "2d"],
  ]},
];

function Notifs() {
  return (
    <PageShell eyebrow="Inbox" title="Notifications">
      <div className="space-y-6">
        {GROUPS.map(g => (
          <Card key={g.title} className="p-6">
            <SectionTitle kicker="Updates" title={g.title} action={<span className="text-xs text-gold">Mark all read</span>} />
            <ul className="space-y-2">
              {g.items.map(([t, w]) => (
                <li key={t} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
                  <span className="grid h-9 w-9 place-items-center rounded-full gradient-gold text-[#0B0D10]"><g.icon className="h-4 w-4" /></span>
                  <div className="flex-1">{t}</div>
                  <span className="text-xs text-muted-foreground">{w}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
