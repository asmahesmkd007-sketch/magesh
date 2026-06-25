import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Card, SectionTitle } from "@/components/site/Primitives";
import { Search as SearchIcon, User, Users, Trophy, Newspaper } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "Search — ChessOx" }] }),
  component: Search,
});

function Search() {
  const [q, setQ] = useState("maharaja");
  return (
    <PageShell eyebrow="Find" title="Search the Court">
      <Card className="flex items-center gap-3 p-3">
        <SearchIcon className="ml-2 h-5 w-5 text-muted-foreground" />
        <input value={q} onChange={e => setQ(e.target.value)} className="flex-1 bg-transparent px-2 py-2 text-base outline-none" placeholder="Players, clubs, tournaments, articles…" />
        <span className="rounded-full bg-gold/10 px-2.5 py-1 text-xs text-gold">⌘K</span>
      </Card>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <SectionTitle kicker="Players" title="People" />
          <ul className="space-y-2">
            {[["Maharaja_Arjun",1842],["MaharajaQueen",1640],["Maharaja_Live",2210]].map(([n,r]) => (
              <li key={n as string} className="flex items-center gap-3 rounded-lg border border-white/5 p-3 text-sm">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gold/10 text-gold"><User className="h-4 w-4" /></span>
                <div className="flex-1">{n}</div>
                <span className="text-gold">{r}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <SectionTitle kicker="Clubs" title="Communities" />
          <ul className="space-y-2">
            {[["Maharaja Knights",420],["Maharaja Academy",680]].map(([n,m]) => (
              <li key={n as string} className="flex items-center gap-3 rounded-lg border border-white/5 p-3 text-sm">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gold/10 text-gold"><Users className="h-4 w-4" /></span>
                <div className="flex-1">{n}</div>
                <span className="text-xs text-muted-foreground">{m} members</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <SectionTitle kicker="Events" title="Tournaments" />
          <ul className="space-y-2">
            {[["Maharaja Cup 2026","Knockout"],["Maharaja Blitz Sunday","Arena"]].map(([n,t]) => (
              <li key={n as string} className="flex items-center gap-3 rounded-lg border border-white/5 p-3 text-sm">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gold/10 text-gold"><Trophy className="h-4 w-4" /></span>
                <div className="flex-1">{n}</div>
                <span className="text-xs text-muted-foreground">{t}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <SectionTitle kicker="Reads" title="Articles" />
          <ul className="space-y-2">
            {[["Maharaja Cup recap","5 min"],["The making of a Maharaja","12 min"]].map(([n,r]) => (
              <li key={n as string} className="flex items-center gap-3 rounded-lg border border-white/5 p-3 text-sm">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gold/10 text-gold"><Newspaper className="h-4 w-4" /></span>
                <div className="flex-1">{n}</div>
                <span className="text-xs text-muted-foreground">{r}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </PageShell>
  );
}
