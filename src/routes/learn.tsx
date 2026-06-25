import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, SectionTitle } from "@/components/site/Primitives";
import { Play, BookOpen, Layers, Castle } from "lucide-react";

export const Route = createFileRoute("/learn")({
  head: () => ({ meta: [{ title: "Learn — ChessOx Academy" }] }),
  component: Learn,
});

const COURSES = [
  ["Sicilian Mastery", "GM Anand", "Intermediate", 24, "from-amber-500 to-rose-600", "sicilian-mastery"],
  ["The Indian Endgame", "GM Harikrishna", "Advanced", 18, "from-emerald-500 to-teal-700", "indian-endgame"],
  ["Opening Principles", "IM Tania", "Beginner", 12, "from-sky-500 to-indigo-700", "opening-principles"],
  ["King's Indian Royal", "GM Gukesh", "Advanced", 22, "from-fuchsia-500 to-violet-700", "kings-indian-royal"],
  ["Caro-Kann Clarity", "GM Praggu", "Intermediate", 16, "from-orange-500 to-red-600", "caro-kann-clarity"],
  ["Tactical Bootcamp", "IM Vidit", "All", 30, "from-yellow-500 to-amber-700", "tactical-bootcamp"],
];

function Learn() {
  return (
    <PageShell eyebrow="The Academy" title="Learn from masters" subtitle="Courses, lessons, and video masterclasses crafted by India's finest.">
      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: BookOpen, t: "Courses", n: 124 },
          { icon: Play, t: "Video Lessons", n: 2800 },
          { icon: Layers, t: "Opening Lines", n: 540 },
          { icon: Castle, t: "Endgame Drills", n: 320 },
        ].map((c) => (
          <Card key={c.t} className="p-5">
            <c.icon className="h-6 w-6 text-gold" />
            <div className="mt-3 font-display text-2xl text-gradient-gold">{c.n}</div>
            <div className="text-sm text-muted-foreground">{c.t}</div>
          </Card>
        ))}
      </div>

      <SectionTitle kicker="Featured" title="Courses" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COURSES.map(([t, a, lvl, l, g, slug]) => (
          <Link to="/course/$slug" params={{ slug: slug as string }} key={t as string}>
            <Card className="overflow-hidden transition-transform hover:-translate-y-1">
              <div className={`relative aspect-[16/10] bg-gradient-to-br ${g}`}>
                <div className="absolute inset-0 mandala-bg opacity-60" />
                <div className="absolute inset-0 grid place-items-center font-display text-7xl text-black/30">♛</div>
                <span className="absolute right-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-xs backdrop-blur">{lvl}</span>
              </div>
              <div className="p-5">
                <div className="font-display text-xl">{t}</div>
                <div className="mt-1 text-sm text-muted-foreground">by {a} · {l} lessons</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <SectionTitle kicker="Browse" title="By Level" />
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Beginner", "Start your journey from a pawn.", "from-emerald-600 to-teal-800", "opening-principles"],
          ["Intermediate", "Refine your tactical sight.", "from-amber-600 to-orange-800", "sicilian-mastery"],
          ["Advanced", "Train like a grandmaster.", "from-rose-600 to-violet-800", "indian-endgame"],
        ].map(([t, d, g, slug]) => (
          <Card key={t as string} className={`relative overflow-hidden p-6`}>
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${g} opacity-20`} />
            <div className="relative">
              <div className="font-display text-2xl">{t}</div>
              <div className="mt-1 text-sm text-muted-foreground">{d}</div>
              <Link to="/course/$slug" params={{ slug: slug as string }} className="mt-4 inline-flex text-sm text-gold">Explore →</Link>
            </div>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
