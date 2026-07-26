// =====================================================================
// ABOUT US — ChessOX Information Hub
// ---------------------------------------------------------------------
// Six-section page: (1) ChessOX Introduction, (2) About ChessOX — the
// original About Us content, kept intact, (3) Mission & Vision,
// (4) Platform Features, (5) Why Choose ChessOX, (6) Information
// Library ("Chess Knowledge Center") — unlimited published articles
// from the about_articles CMS, rendered verbatim with search,
// category/tag filters, and pagination. Admin manages content at
// /admin/about-chess. The library never overwrites the sections above.
// =====================================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Clock, Search, Tag } from "lucide-react";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { ContentRenderer } from "@/components/about/ContentRenderer";
import { listArticles, readingTime, type AboutArticle } from "@/lib/api/aboutClient";
import { seo, breadcrumbLd, faqLd, webPageLd } from "@/lib/seo";

// Questions people actually ask about the platform. These are rendered on the
// page (section 07) and mirrored into FAQPage structured data — the schema and
// the visible content must always stay in sync.
const ABOUT_FAQ = [
  {
    question: "What is ChessOx?",
    answer:
      "ChessOx is an online chess platform where you can play chess online against players around the world, play chess with friends, solve chess puzzles, learn chess from the basics upward, join online chess tournaments and follow global chess rankings.",
  },
  {
    question: "Who is ChessOx for?",
    answer:
      "ChessOx is built for chess players at every level — complete beginners learning the rules, improving club players, and competitive players chasing rating. It serves chess players in India and worldwide.",
  },
  {
    question: "Is ChessOx free to play?",
    answer:
      "Yes. Playing chess online, solving chess puzzles, using the learning guides and joining free tournaments cost nothing. An optional Premium membership adds extras such as unlimited puzzles, deeper analysis and an ad-free experience.",
  },
  {
    question: "How can I play chess with friends online on ChessOx?",
    answer:
      "Open Play, choose Friend Challenge, pick a time control and colour, then share the generated invite link. Your friend opens the link and the private chess game begins.",
  },
  {
    question: "What are the chess puzzles on ChessOx?",
    answer:
      "Chess puzzles are real positions with one best sequence of moves. ChessOx includes a free chess puzzle trainer with hints, solutions, streaks and daily goals, plus Puzzle Rush — a timed chess tactics challenge.",
  },
  {
    question: "How does chess ranking work on ChessOx?",
    answer:
      "Rated games update your chess rating, and the leaderboards rank players by rating, wins, matches played, win rate, puzzle rating and win streak. Rankings can be viewed globally or filtered by country, and by state and district within India.",
  },
  {
    question: "Can beginners learn chess online on ChessOx?",
    answer:
      "Yes. The learn section explains how to play chess step by step — board setup, how the pieces move, the special rules and how to win — while academy courses cover chess openings, strategy, tactics and endgames.",
  },
];

export const Route = createFileRoute("/about")({
  head: () =>
    seo({
      title: "About ChessOx — Online Chess Platform for India & the World",
      description:
        "About ChessOx: what the platform is, who it is for and what you can do on it — play chess online, play with friends, solve chess puzzles, learn chess, and compete in online chess tournaments.",
      keywords: [
        "about ChessOx",
        "online chess platform",
        "online chess India",
        "chess community",
        "learn chess online",
      ],
      path: "/about",
      jsonLd: [
        webPageLd({
          name: "About ChessOx",
          description:
            "An overview of ChessOx: mission and vision, platform features, why players choose it, and answers to common questions about the online chess platform.",
          path: "/about",
          primaryTopic: "ChessOx online chess platform",
          about: ["Online chess platform", "Chess community", "Online chess India"],
        }),
        faqLd(ABOUT_FAQ),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
        ]),
      ],
    }),
  component: AboutUsPage,
});

function SectionHeading({ num, title }: { num: string; title: string }) {
  return (
    <div className="mb-5">
      <div className="mb-1 flex items-center gap-2 text-gold">
        <span className="text-sm">◆</span>
        <span className="text-sm tracking-[0.3em]">{num}</span>
      </div>
      <h2 className="font-display text-3xl md:text-4xl">{title}</h2>
    </div>
  );
}

function AboutUsPage() {
  return (
    <PageShell title="About ChessOx">
      <div className="mx-auto max-w-4xl">
        {/* ============ Section 1 — ChessOX Introduction ============ */}
        <section className="rounded-2xl border border-gold/20 bg-gradient-to-b from-gold/10 to-transparent p-8 md:p-12 text-center">
          {/* h2 — PageShell already renders this page's single h1 ("About ChessOx"). */}
          <h2 className="font-display text-5xl md:text-6xl text-gradient-gold">ChessOX</h2>
          <p className="mt-2 font-display text-xl text-gold/90">The Evolution of Strategy</p>
          <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-ivory/85">
            A modern chess platform designed for players, learners, competitors, and the global
            chess community.
          </p>
        </section>

        {/* ============ Section 2 — About ChessOX (original content, intact) ============ */}
        <section className="py-10 border-b border-white/5">
          <SectionHeading num="02" title="About ChessOX" />
          <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
            ChessOx is an online chess platform built for people who want to play, improve and
            compete without friction. It runs in any modern browser, with no download, and the core
            of it — playing chess, solving puzzles and learning the game — is free.
          </p>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-left">
            <h3 className="font-display text-xl mb-2 text-gold">How ChessOx Works</h3>
            <p className="text-sm text-ivory/80">
              Every move in an online game is validated on our servers rather than in your browser,
              so results and ratings cannot be forged. Games, puzzle progress, ratings and
              tournament standings are stored against your account, which means your history follows
              you across devices. Fair play is enforced through server-side validation, statistical
              review and player reports, and is described in full in our Fair Play &amp;
              Anti-Cheating Policy.
            </p>
          </div>
        </section>

        {/* ============ Section 3 — Mission & Vision ============ */}
        <section className="py-10 border-b border-white/5">
          <SectionHeading num="03" title="Mission & Vision" />

          <h3 className="mb-2 font-display text-2xl text-gold">Our Mission</h3>
          <p className="mb-4 leading-relaxed text-ivory/85">
            At ChessOX, our mission is to redefine the online chess experience by uniting passion
            with cutting-edge technology. We aim to foster an inclusive environment that benefits
            everyone from eager beginners to seasoned grandmasters.
          </p>
          <div className="mb-8 space-y-3">
            {[
              [
                "Making Chess Accessible",
                "Breaking down barriers to entry so anyone can learn and play from anywhere.",
              ],
              [
                "Building a Competitive Platform",
                "Providing robust matchmaking, real-time analytics, and smooth gameplay.",
              ],
              [
                "Creating Learning Opportunities",
                "Integrating top-tier educational resources, tutorials, and bot training.",
              ],
              [
                "Supporting Tournaments",
                "Empowering players to host, join, and compete in structured and rewarding tournaments.",
              ],
              [
                "Growing the Chess Community",
                "Cultivating a positive, global network of chess enthusiasts.",
              ],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="font-medium text-gold">{t}:</div>
                <div className="mt-0.5 text-sm text-ivory/80">{d}</div>
              </div>
            ))}
          </div>

          <h3 className="mb-2 font-display text-2xl text-gold">Our Vision</h3>
          <p className="mb-4 leading-relaxed text-ivory/85">
            We envision a future where ChessOX is the definitive hub for chess worldwide, constantly
            evolving to meet the needs of the modern player.
          </p>
          <div className="space-y-3">
            {[
              [
                "Global Tournaments",
                "Hosting massive, international events with significant rewards.",
              ],
              [
                "Advanced Analysis",
                "Bringing state-of-the-art AI engine evaluations directly to every player.",
              ],
              [
                "Chess Education",
                "Expanding our library to feature grandmaster-led masterclasses.",
              ],
              [
                "Community Growth",
                "Facilitating localized clubs, global leaderboards, and forums.",
              ],
              [
                "International Expansion",
                "Offering localized content and features across multiple languages and regions.",
              ],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="font-medium text-gold">{t}:</div>
                <div className="mt-0.5 text-sm text-ivory/80">{d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ============ Section 4 — Platform Features ============ */}
        <section className="py-10 border-b border-white/5">
          <SectionHeading num="04" title="Platform Features" />
          <h3 className="mb-4 font-display text-xl text-gold">What We Offer</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["♟", "Online Matches"],
              ["🏠", "Local Matches"],
              ["🤝", "Friends Matches"],
              ["🚪", "Room Matches"],
              ["🤖", "AI Chess Bots"],
              ["🏆", "Paid Tournaments"],
              ["💰", "Wallet System"],
              ["📚", "Learning Resources"],
            ].map(([icon, t]) => (
              <Card key={t} className="p-4 text-center">
                <div className="text-2xl">{icon}</div>
                <div className="mt-1.5 text-sm text-ivory/90">{t}</div>
              </Card>
            ))}
          </div>
        </section>

        {/* ============ Section 5 — Why Choose ChessOX ============ */}
        <section className="py-10 border-b border-white/5">
          <SectionHeading num="05" title="Why Choose ChessOX" />
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ["🎨", "Modern Design"],
              ["⚖", "Fair Play"],
              ["🛡", "Secure Platform"],
              ["⚡", "Fast Matchmaking"],
              ["🌐", "Community Driven"],
            ].map(([icon, t]) => (
              <Card key={t} className="p-4 text-center">
                <div className="text-2xl">{icon}</div>
                <div className="mt-1.5 text-sm text-ivory/90">{t}</div>
              </Card>
            ))}
          </div>
        </section>

        {/* ============ Section 6 — Information Library ============ */}
        <section className="py-10">
          <SectionHeading num="06" title="Chess Knowledge Center" />
          <InformationLibrary />
        </section>

        {/* ============ Section 7 — Frequently Asked Questions ============ */}
        <section className="border-t border-white/5 py-10">
          <SectionHeading num="07" title="Frequently Asked Questions" />
          <div className="space-y-3">
            {ABOUT_FAQ.map((item) => (
              <div
                key={item.question}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
              >
                <h3 className="font-medium text-gold">{item.question}</h3>
                <p className="mt-0.5 text-sm text-ivory/80">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Get In Touch ---- */}
        <section className="border-t border-white/5 py-10">
          <h2 className="mb-5 font-display text-2xl text-gold">Get In Touch</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Official Website", "www.chessox.com"],
              ["Support Email", "contact@chessox.com"],
              ["Social Media", "@chessoxcom"],
            ].map(([t, v]) => (
              <Card key={t} className="p-5 text-center">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{t}</div>
                <div className="mt-1.5 text-sm text-gold">{v}</div>
              </Card>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link to="/home">
              <GoldButton>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
              </GoldButton>
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

// =====================================================================
// Information Library — published CMS articles, rendered verbatim
// =====================================================================
const PAGE_SIZE = 5;

function InformationLibrary() {
  const [articles, setArticles] = useState<AboutArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [tag, setTag] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    listArticles(true)
      .then(setArticles)
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(articles.map((a) => a.category)))],
    [articles],
  );
  const tags = useMemo(
    () => Array.from(new Set(articles.flatMap((a) => a.tags))).slice(0, 20),
    [articles],
  );

  const filtered = useMemo(
    () =>
      articles.filter(
        (a) =>
          (category === "All" || a.category === category) &&
          (!tag || a.tags.includes(tag)) &&
          (a.title + " " + a.content + " " + a.tags.join(" "))
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [articles, search, category, tag],
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const shown = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading library…</p>;
  }

  if (articles.length === 0) {
    return (
      <Card className="p-8 text-center">
        <BookOpen className="mx-auto mb-3 h-8 w-8 text-gold" />
        <p className="text-sm text-muted-foreground">
          The Chess Knowledge Center is being stocked. Published articles, guides, rules, openings,
          player biographies, and lessons will appear here.
        </p>
      </Card>
    );
  }

  return (
    <div>
      {/* search + filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search the knowledge center…"
            className="w-full rounded-xl border border-white/10 bg-transparent py-2.5 pl-10 pr-3 text-sm outline-none focus:border-gold/40"
          />
        </div>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm capitalize outline-none"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {tags.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTag(tag === t ? null : t);
                setPage(1);
              }}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                tag === t
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Tag className="h-3 w-3" />
              {t}
            </button>
          ))}
        </div>
      )}

      {/* articles — full original content, rendered exactly as entered */}
      <div className="space-y-5">
        {shown.map((a) => {
          const isLong = a.content.split("\n").length > 40;
          const open = expanded[a.id] || !isLong;
          return (
            <Card key={a.id} className="p-6">
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="rounded-full bg-gold/10 px-2.5 py-0.5 capitalize text-gold">
                  {a.category}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {readingTime(a.content)} min read
                </span>
                <span>Updated {new Date(a.updated_at).toLocaleDateString()}</span>
                {a.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {t}
                  </span>
                ))}
              </div>
              <h3 className="mb-3 font-display text-2xl">{a.title}</h3>
              <div className={open ? "" : "relative max-h-[420px] overflow-hidden"}>
                <ContentRenderer content={a.content} />
                {!open && (
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
                )}
              </div>
              {isLong && (
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [a.id]: !open }))}
                  className="mt-3 rounded-xl border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold hover:bg-gold/20"
                >
                  {open ? "Collapse" : "Read Full Article"}
                </button>
              )}
            </Card>
          );
        })}
        {shown.length === 0 && (
          <p className="text-sm text-muted-foreground">No articles match your filters.</p>
        )}
      </div>

      {/* pagination */}
      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            disabled={safePage <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-white/10 p-2 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            Page {safePage} of {pages}
          </span>
          <button
            disabled={safePage >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-white/10 p-2 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
