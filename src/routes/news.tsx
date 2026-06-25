import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Card, SectionTitle } from "@/components/site/Primitives";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/news")({
  head: () => ({ meta: [{ title: "News — ChessOx" }] }),
  component: News,
});

const FEATURED = [
  ["Anand crowns the year with Maharaja Cup victory", "Tournament", "5 min read", "from-amber-500 to-rose-700"],
  ["Gukesh becomes youngest world champion candidate", "Profile", "8 min read", "from-emerald-500 to-teal-700"],
];

const ARTICLES = [
  ["The rise of Indian chess: a generational shift", "Feature", "12 min"],
  ["Why the Sicilian Najdorf is back in 2026", "Openings", "7 min"],
  ["Interview: Praggnanandhaa on his routine", "Interview", "10 min"],
  ["Endgame study: the rook lift you've been missing", "Endgames", "6 min"],
  ["Brass Blitz Open recap: a thrilling final", "Report", "5 min"],
  ["From 1200 to 2000: a coach's playbook", "Coaching", "9 min"],
];

function News() {
  return (
    <PageShell eyebrow="The Gazette" title="News & Stories" subtitle="The pulse of the royal chess world.">
      <div className="mb-10 grid gap-5 md:grid-cols-2">
        {FEATURED.map(([t, tag, r, g]) => (
          <Card key={t as string} className="overflow-hidden transition-transform hover:-translate-y-1">
            <div className={`relative aspect-[16/9] bg-gradient-to-br ${g}`}>
              <div className="absolute inset-0 mandala-bg opacity-50" />
              <span className="absolute left-4 top-4 rounded-full bg-black/40 px-2.5 py-1 text-xs backdrop-blur">{tag}</span>
            </div>
            <div className="p-5">
              <div className="font-display text-2xl">{t}</div>
              <div className="mt-1 text-xs text-muted-foreground">{r}</div>
            </div>
          </Card>
        ))}
      </div>

      <SectionTitle kicker="Latest" title="Articles" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ARTICLES.map(([t, tag, r]) => (
          <Card key={t as string} className="p-5 transition-transform hover:-translate-y-1">
            <div className="text-xs uppercase tracking-widest text-gold">{tag}</div>
            <div className="mt-2 font-display text-lg leading-snug">{t}</div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{r} read</span>
              <ArrowRight className="h-4 w-4 text-gold" />
            </div>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
