import { createFileRoute, Link } from "@tanstack/react-router";
import { VsComputer } from "@/components/site/VsComputer";
import { Swords, Cpu } from "lucide-react";

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [
      { title: "Play Chess — ChessOx" },
      { name: "description", content: "Play live chess against friends or the ChessOx engine in a royal arena." },
    ],
  }),
  component: Play,
});

function Play() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-page" />
      <div className="pointer-events-none absolute inset-0 mandala-bg opacity-60" />
      <div className="pointer-events-none absolute left-0 top-32 h-80 w-80 rounded-full hero-spotlight blur-3xl" />
      <div className="relative mx-auto max-w-[1500px] px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/play/friend" className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-5 py-2.5 text-sm text-gold transition hover:bg-gold/20">
            <Swords className="h-4 w-4" /> Play a Friend (Live)
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm text-muted-foreground">
            <Cpu className="h-4 w-4" /> Vs Computer (below)
          </div>
        </div>
        <VsComputer />
      </div>
    </div>
  );
}

