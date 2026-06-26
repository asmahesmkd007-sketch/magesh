import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, GhostButton } from "@/components/site/Primitives";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/news/$slug")({
  head: () => ({ meta: [{ title: "Article — ChessOx" }] }),
  component: ArticlePage,
});

type Article = {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  read_time_min: number | null;
  cover_gradient: string | null;
  body: string | null;
  excerpt: string | null;
  published_at: string | null;
  author_name: string | null;
};

function ArticlePage() {
  const { slug } = Route.useParams();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("news_articles")
      .select(
        "id,title,slug,category,read_time_min,cover_gradient,body,excerpt,published_at,author_name",
      )
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }) => {
        setArticle(data as Article | null);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <PageShell title="Loading…">
        <div className="grid place-items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </PageShell>
    );
  }

  if (!article) {
    return (
      <PageShell title="Not found">
        <Card className="p-10 text-center">
          <p className="text-muted-foreground">This article was not found.</p>
          <div className="mt-4">
            <Link to="/news">
              <GhostButton>
                <ArrowLeft className="h-4 w-4" /> Back to News
              </GhostButton>
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow={article.category ?? "Article"} title={article.title}>
      <div className="mx-auto max-w-3xl">
        {article.cover_gradient && (
          <div
            className={`relative mb-8 aspect-[16/9] overflow-hidden rounded-2xl bg-gradient-to-br ${article.cover_gradient}`}
          >
            <div className="absolute inset-0 mandala-bg opacity-50" />
          </div>
        )}
        <div className="mb-6 flex items-center gap-4 text-sm text-muted-foreground">
          {article.author_name && <span>By {article.author_name}</span>}
          {article.published_at && (
            <span>
              {new Date(article.published_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          )}
          {article.read_time_min && <span>{article.read_time_min} min read</span>}
        </div>
        {article.excerpt && <p className="mb-6 text-lg text-muted-foreground">{article.excerpt}</p>}
        {article.body ? (
          <div
            className="prose prose-invert max-w-none text-sm leading-relaxed text-foreground/90"
            dangerouslySetInnerHTML={{ __html: article.body.replace(/\n/g, "<br/>") }}
          />
        ) : (
          <Card className="p-8 text-center text-muted-foreground">
            Full article content coming soon.
          </Card>
        )}
        <div className="mt-10">
          <Link to="/news">
            <GhostButton>
              <ArrowLeft className="h-4 w-4" /> Back to News
            </GhostButton>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
