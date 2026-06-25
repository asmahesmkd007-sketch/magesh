import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Card } from "@/components/site/Primitives";
import { Send, Hash } from "lucide-react";

export const Route = createFileRoute("/room")({
  head: () => ({ meta: [{ title: "Public Room — ChessOx" }] }),
  component: Room,
});

const ROOMS = ["#general", "#openings", "#endgames", "#tournaments", "#beginners", "#india", "#blitz", "#puzzles"];
const MEMBERS = ["GrandMogul","SiciliaNova","PriyaQueen","NajdorfNinja","EndgameEva","MattHandler","BishopBibek","GambitGopi","TaranTactic","KingsbeardX","RookieRumi"];
const MSGS = [
  ["GrandMogul","Anyone analyzing the Anand-Carlsen rapid?"],
  ["SiciliaNova","Yes! Move 18 was wild."],
  ["PriyaQueen","I think Bxf7 was the only winning try."],
  ["NajdorfNinja","Stockfish disagrees but it works practically."],
  ["EndgameEva","Engines hate the human touch 😄"],
  ["BishopBibek","Cool — anyone up for a 3+0 in #blitz?"],
];

function Room() {
  return (
    <PageShell eyebrow="The Court" title="Public Room">
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-5 lg:col-span-3">
          <div className="mb-3 font-display">Rooms</div>
          <ul className="space-y-1 text-sm">
            {ROOMS.map((r, i) => (
              <li key={r}>
                <button className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left ${i===0 ? "bg-gold/10 text-gold" : "text-muted-foreground hover:bg-white/5"}`}>
                  <Hash className="h-3.5 w-3.5" />{r.slice(1)}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col lg:col-span-6">
          <div className="border-b border-white/5 p-4">
            <div className="font-display"># general</div>
            <div className="text-xs text-muted-foreground">2,134 members · 184 online</div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin" style={{ minHeight: "500px" }}>
            {MSGS.map(([u,m], i) => (
              <div key={i} className="flex gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold/10 text-xs text-gold">{u[0]}</div>
                <div>
                  <div className="text-xs"><span className="text-gold">{u}</span> <span className="text-muted-foreground">· now</span></div>
                  <div className="mt-0.5 text-sm">{m}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-white/5 p-3">
            <div className="flex gap-2">
              <input className="flex-1 rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 text-sm outline-none focus:border-gold/40" placeholder="Message #general" />
              <button className="grid h-10 w-10 place-items-center rounded-full gradient-gold text-[#0B0D10]"><Send className="h-4 w-4" /></button>
            </div>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-3">
          <div className="mb-3 font-display">Online</div>
          <ul className="space-y-2 text-sm">
            {MEMBERS.map(m => (
              <li key={m} className="flex items-center gap-2">
                <span className="relative grid h-7 w-7 place-items-center rounded-full bg-gold/10 text-xs text-gold">
                  {m[0]}<span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald ring-2 ring-card" />
                </span>
                {m}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </PageShell>
  );
}
