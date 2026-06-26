import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  PageShell,
  Card,
  GoldButton,
  GhostButton,
  SectionTitle,
} from "@/components/site/Primitives";
import { Play, Lock, Clock, BookOpen, Download, CheckCircle2 } from "lucide-react";
import { getCourse, COURSES } from "@/lib/courses";

export const Route = createFileRoute("/course/$slug")({
  head: ({ params }) => {
    const course = getCourse(params.slug);
    return { meta: [{ title: `${course?.title ?? "Course"} — ChessOx` }] };
  },
  loader: ({ params }) => {
    const course = getCourse(params.slug);
    if (!course) throw notFound();
    return { course };
  },
  notFoundComponent: () => (
    <PageShell eyebrow="The Academy" title="Course not found">
      <Link to="/learn" className="text-sm text-gold">
        ← Back to Academy
      </Link>
    </PageShell>
  ),
  component: CoursePage,
});

function CoursePage() {
  const { course } = Route.useLoaderData() as { course: ReturnType<typeof getCourse> & object };
  const others = COURSES.filter((c) => c.slug !== course.slug).slice(0, 3);

  return (
    <PageShell>
      <Card className="relative overflow-hidden p-8 md:p-12">
        <div
          className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${course.gradient}`}
        />
        <div className="pointer-events-none absolute inset-0 mandala-bg opacity-50" />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <div className="font-display text-xs uppercase tracking-[0.3em] text-gold">
              Masterclass · {course.level}
            </div>
            <h1 className="mt-2 font-display text-5xl">{course.title}</h1>
            <p className="mt-2 max-w-xl text-muted-foreground">{course.blurb}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-white/10 px-3 py-1">
                {course.lessonCount} Lessons
              </span>
              <span className="rounded-full border border-white/10 px-3 py-1">
                {course.duration}
              </span>
              <span className="rounded-full border border-gold/30 px-3 py-1 text-gold">
                by {course.instructor}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <GoldButton>
              <Play className="h-4 w-4" /> Start Course
            </GoldButton>
            <GhostButton>
              <Download className="h-4 w-4" /> Resources
            </GhostButton>
          </div>
        </div>
      </Card>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <SectionTitle kicker="Path" title="Chapters" />
          <ul className="space-y-2">
            {course.chapters.map((ch: { title: string; length: string }, i: number) => (
              <li
                key={ch.title}
                className={`flex items-center gap-4 rounded-xl border p-4 ${i === 0 ? "border-gold/40 bg-gold/5" : "border-white/5 bg-white/[0.02]"}`}
              >
                <div className="grid h-9 w-9 place-items-center rounded-full bg-background/40">
                  {i === 0 ? (
                    <Play className="h-4 w-4 text-gold" />
                  ) : (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-sm">Chapter {i + 1}</div>
                  <div className="font-display text-lg">{ch.title}</div>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> {ch.length}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card className="p-6">
            <SectionTitle
              kicker="Instructor"
              title={course.instructor.split(" ").slice(1).join(" ")}
            />
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full gradient-gold font-display text-lg text-[#0B0D10]">
                {course.instructor
                  .split(" ")
                  .slice(1)
                  .map((w: string) => w[0])
                  .join("")
                  .slice(0, 2)}
              </span>
              <div>
                <div className="text-sm">{course.instructor}</div>
                <div className="text-xs text-muted-foreground">
                  {course.level} · {course.lessonCount} lessons
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle kicker="Materials" title="Resources" />
            <ul className="space-y-2 text-sm">
              {[`PGN: ${course.title} main lines`, "PDF: Course workbook", "PGN: Model games"].map(
                (r) => (
                  <li
                    key={r}
                    className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2"
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-gold" />
                      {r}
                    </span>
                    <button className="text-xs text-gold">Download</button>
                  </li>
                ),
              )}
            </ul>
          </Card>

          <Card className="p-6">
            <SectionTitle kicker="Continue" title="More Courses" />
            <ul className="space-y-2 text-sm">
              {others.map((c) => (
                <li key={c.slug}>
                  <Link
                    to="/course/$slug"
                    params={{ slug: c.slug }}
                    className="flex items-center gap-2 rounded-lg border border-white/5 px-3 py-2 transition-colors hover:border-gold/30 hover:text-gold"
                  >
                    <CheckCircle2 className="h-4 w-4 text-gold" /> {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <Link to="/learn" className="text-sm text-gold">
          ← Back to Academy
        </Link>
      </div>
    </PageShell>
  );
}
