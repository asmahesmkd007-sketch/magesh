import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, SectionTitle, GoldButton } from "@/components/site/Primitives";
import { Users, Search } from "lucide-react";

export const Route = createFileRoute("/clubs")({
  head: () => ({ meta: [{ title: "Clubs — ChessOx" }] }),
  component: Clubs,
});

const FEATURED = [
  ["Mumbai Knights", 1240, "Maharashtra", "from-amber-500 to-rose-700"],
  ["Kolkata Castles", 890, "West Bengal", "from-emerald-500 to-teal-700"],
  ["Delhi Diamonds", 1620, "Delhi", "from-violet-500 to-indigo-700"],
];
const DIRECTORY = [
  ["Bangalore Bishops", 720], ["Chennai Champions", 1100], ["Hyderabad Heralds", 540],
  ["Pune Pawnstars", 410], ["Jaipur Jewels", 320], ["Kerala Kings", 690],
  ["Goan Gambits", 240], ["Lucknow Legends", 510], ["Ahmedabad Aces", 470],
];

function Clubs() {
  return (
    <PageShell eyebrow="Brotherhood" title="Clubs" subtitle="Join a court of like-minded royals. Compete, learn, and rise together.">
      <Card className="mb-8 flex items-center gap-3 p-3">
        <Search className="ml-2 h-4 w-4 text-muted-foreground" />
        <input className="flex-1 bg-transparent px-2 py-1.5 text-sm outline-none" placeholder="Search clubs by name, city or rating…" />
        <GoldButton>Create Club</GoldButton>
      </Card>

      <SectionTitle kicker="Featured" title="Royal courts" />
      <div className="grid gap-4 md:grid-cols-3">
        {FEATURED.map(([n,m,r,g]) => (
          <Link to="/club" key={n as string}>
            <Card className="overflow-hidden transition-transform hover:-translate-y-1">
              <div className={`relative h-32 bg-gradient-to-br ${g}`}>
                <div className="absolute inset-0 mandala-bg opacity-50" />
                <div className="absolute inset-0 grid place-items-center font-display text-5xl text-black/30">♛</div>
              </div>
              <div className="p-5">
                <div className="font-display text-xl">{n}</div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{r}</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {m}</span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <SectionTitle kicker="Directory" title="All clubs" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DIRECTORY.map(([n,m]) => (
          <Link to="/club" key={n as string}>
            <Card className="flex items-center justify-between p-4 hover:border-gold/30">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg gradient-gold text-[#0B0D10] font-display">{(n as string)[0]}</div>
                <div>
                  <div className="text-sm font-display">{n}</div>
                  <div className="text-xs text-muted-foreground">{m} members</div>
                </div>
              </div>
              <span className="text-xs text-gold">Join</span>
            </Card>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
