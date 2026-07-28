import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, GhostButton } from "@/components/site/Primitives";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DOMPurify from "isomorphic-dompurify";
import {
  seo,
  breadcrumbLd,
  newsArticleLd,
  editorialTeamLd,
  EDITORIAL_TEAM,
  SITE_NAME,
} from "@/lib/seo";

type Article = {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  read_time_min: number | null;
  cover_gradient: string | null;
  cover_image: string | null;
  body: string | null;
  excerpt: string | null;
  published_at: string | null;
  author_name: string | null;
};

const SELECT =
  "id,title,slug,category,read_time_min,cover_gradient,cover_image,body,excerpt,published_at,author_name";

/** Trim a description to a clean sentence boundary within `max` characters. */
function clamp(text: string, max = 158): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "), cut.lastIndexOf(" "));
  return `${cut.slice(0, stop > 80 ? stop : max).trim()}…`;
}

export const Route = createFileRoute("/news/$slug")({
  // The article is loaded here rather than in the component so that the real
  // title, excerpt, image and publication date are available to head() — and
  // so the body is server-rendered for crawlers instead of appearing only
  // after client-side hydration.
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("news_articles")
      .select(SELECT)
      .eq("slug", params.slug)
      .maybeSingle();
    return { article: (data as Article | null) ?? null };
  },
  head: ({ params, loaderData }) => {
    const article = loaderData?.article ?? null;
    const path = `/news/${params.slug}`;

    // No article (bad slug, or not yet published) — keep it out of the index.
    if (!article) {
      return seo({
        title: `Article Not Found — Chess News | ${SITE_NAME}`,
        description:
          "This chess news article is not available. Browse the latest chess news, tournament reports and player updates on ChessOx.",
        robots: "noindex, follow",
      });
    }

    const description = clamp(
      article.excerpt?.trim() ||
        `${article.title} — chess news, results and analysis reported by the ${EDITORIAL_TEAM.name}.`,
    );
    const published = article.published_at ?? undefined;
    const keywords = ["chess news", article.category, article.title]
      .filter((k): k is string => Boolean(k))
      .slice(0, 6);

    return seo({
      title: `${article.title} | ${SITE_NAME}`,
      description,
      keywords,
      path,
      type: "news.article",
      image: article.cover_image ?? undefined,
      imageAlt: article.title,
      jsonLd: [
        editorialTeamLd(),
        newsArticleLd({
          headline: article.title,
          description,
          path,
          datePublished: published ?? new Date(0).toISOString(),
          image: article.cover_image,
          articleSection: article.category,
          keywords,
          wordCount: article.body
            ? article.body
                .replace(/<[^>]+>/g, " ")
                .split(/\s+/)
                .filter(Boolean).length
            : undefined,
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Chess News", path: "/news" },
          { name: article.title, path },
        ]),
      ],
    });
  },
  component: ArticlePage,
});

function ArticlePage() {
  const { article } = Route.useLoaderData();

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
        {article.cover_image ? (
          <img
            src={article.cover_image}
            alt={article.title}
            width={1200}
            height={675}
            className="mb-8 aspect-[16/9] w-full rounded-2xl object-cover"
          />
        ) : (
          article.cover_gradient && (
            <div
              className={`relative mb-8 aspect-[16/9] overflow-hidden rounded-2xl bg-gradient-to-br ${article.cover_gradient}`}
            >
              <div className="absolute inset-0 mandala-bg opacity-50" />
            </div>
          )
        )}
        <div className="mb-6 flex items-center gap-4 text-sm text-muted-foreground">
          {article.author_name && (
            <span>
              By{" "}
              <Link to="/editorial-team" className="transition-colors hover:text-gold">
                {article.author_name}
              </Link>
            </span>
          )}
          {article.published_at && (
            <time dateTime={article.published_at}>
              {new Date(article.published_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
          )}
          {article.read_time_min && <span>{article.read_time_min} min read</span>}
        </div>
        {article.excerpt && <p className="mb-6 text-lg text-muted-foreground">{article.excerpt}</p>}
        {article.body ? (
          <div
            className="prose prose-invert max-w-none text-sm leading-relaxed text-foreground/90"
            // Article bodies are admin-authored (RLS restricts INSERT/UPDATE
            // on news_articles to admins), but still sanitized before
            // rendering as raw HTML — defense in depth against a compromised
            // admin session or unsanitized paste from an external source.
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(article.body.replace(/\n/g, "<br/>")),
            }}
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
