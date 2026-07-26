import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, SectionTitle } from "@/components/site/Primitives";
import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { seo, breadcrumbLd, collectionPageLd } from "@/lib/seo";

export const Route = createFileRoute("/news/")({
  head: () =>
    seo({
      title: "Chess News — Latest Chess News & Updates | ChessOx",
      description:
        "Read the latest chess news on ChessOx: tournament reports, player stories, opening trends and platform updates from the world of chess.",
      keywords: [
        "chess news",
        "latest chess news",
        "chess news today",
        "chess updates",
        "world chess news",
      ],
      // Anonymous reads on news_articles now work, but no article has been
      // published yet, so this page still renders empty to a crawler. Remove
      // this line once the newsroom has published articles — individual
      // article pages already gate themselves (they emit noindex only when
      // the loader finds no article).
      robots: "noindex, follow",
      jsonLd: [
        collectionPageLd({
          name: "Chess News — ChessOx",
          description:
            "The ChessOx chess news feed, with featured stories and the latest articles about tournaments, players and the game.",
          path: "/news",
          about: ["Chess news", "Chess updates", "World chess news"],
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Chess News", path: "/news" },
        ]),
      ],
    }),
  component: News,
});

type Article = {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  read_time_min: number | null;
  is_featured: boolean | null;
  cover_gradient: string | null;
  published_at: string | null;
  excerpt: string | null;
};

const GRADIENTS = [
  "from-amber-500 to-rose-700",
  "from-emerald-500 to-teal-700",
  "from-violet-500 to-indigo-700",
  "from-sky-500 to-blue-700",
];

function News() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("news_articles")
      .select(
        "id,title,slug,category,read_time_min,is_featured,cover_gradient,published_at,excerpt",
      )
      .order("published_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setArticles((data ?? []) as Article[]);
        setLoading(false);
      });
  }, []);

  const featured = articles.filter((a) => a.is_featured).slice(0, 2);
  const rest = articles.filter((a) => !a.is_featured);

  if (loading) {
    return (
      <PageShell
        eyebrow="The Gazette"
        title="News & Stories"
        subtitle="The pulse of the royal chess world."
      >
        <div className="grid place-items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="The Gazette"
      title="News & Stories"
      subtitle="The pulse of the royal chess world."
    >
      {featured.length > 0 && (
        <div className="mb-10 grid gap-5 md:grid-cols-2">
          {featured.map((a, i) => (
            <Link to="/news/$slug" params={{ slug: a.slug }} key={a.id}>
              <Card className="overflow-hidden transition-transform hover:-translate-y-1">
                <div
                  className={`relative aspect-[16/9] bg-gradient-to-br ${a.cover_gradient ?? GRADIENTS[i % GRADIENTS.length]}`}
                >
                  <div className="absolute inset-0 mandala-bg opacity-50" />
                  <span className="absolute left-4 top-4 rounded-full bg-black/40 px-2.5 py-1 text-xs backdrop-blur">
                    {a.category ?? "Feature"}
                  </span>
                </div>
                <div className="p-5">
                  <div className="font-display text-2xl">{a.title}</div>
                  {a.excerpt && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{a.excerpt}</p>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground">
                    {a.read_time_min ? `${a.read_time_min} min read` : ""}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <>
          <SectionTitle kicker="Latest" title="Articles" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((a) => (
              <Link to="/news/$slug" params={{ slug: a.slug }} key={a.id}>
                <Card className="p-5 transition-transform hover:-translate-y-1">
                  <div className="text-xs uppercase tracking-widest text-gold">
                    {a.category ?? "Article"}
                  </div>
                  <div className="mt-2 font-display text-lg leading-snug">{a.title}</div>
                  {a.excerpt && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.excerpt}</p>
                  )}
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{a.read_time_min ? `${a.read_time_min} min read` : ""}</span>
                    <ArrowRight className="h-4 w-4 text-gold" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      {articles.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">
          No articles published yet. Check back soon!
        </Card>
      )}
    </PageShell>
  );
}
