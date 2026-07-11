// =====================================================================
// ABOUT CHESS — public page
// ---------------------------------------------------------------------
// Renders the complete Chess Encyclopedia plus every published article
// from the About Chess CMS (admin → About Chess). Articles are shown
// verbatim through ContentRenderer — no truncation or rewriting.
// =====================================================================
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Clock, Tag } from "lucide-react";
import { PageShell, Card } from "@/components/site/Primitives";
import { ChessEncyclopedia } from "@/components/about/ChessEncyclopedia";
import { ContentRenderer } from "@/components/about/ContentRenderer";
import { listArticles, readingTime, type AboutArticle } from "@/lib/api/aboutClient";

export const Route = createFileRoute("/about-chess")({
  head: () => ({ meta: [{ title: "About Chess — ChessOx" }] }),
  component: AboutChessPage,
});

function AboutChessPage() {
  const [articles, setArticles] = useState<AboutArticle[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    listArticles(true)
      .then(setArticles)
      .catch(() => setArticles([]));
  }, []);

  const shown = useMemo(
    () =>
      articles.filter((a) =>
        (a.title + " " + a.category + " " + a.tags.join(" "))
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [articles, search],
  );

  return (
    <PageShell title="About Chess">
      {/* Published CMS articles (if any) */}
      {articles.length > 0 && (
        <div className="mx-auto mb-10 max-w-4xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl text-gradient-gold">Articles &amp; Guides</h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search articles…"
              className="rounded-xl border border-white/10 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-gold/40"
            />
          </div>
          <div className="space-y-6">
            {shown.map((a) => (
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
                {/* Full original content — rendered exactly as submitted */}
                <ContentRenderer content={a.content} />
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* The Complete Chess Encyclopedia */}
      <ChessEncyclopedia />
    </PageShell>
  );
}
