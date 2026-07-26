// Community home: feed tabs (Following / For You / Trending / Latest),
// composer, infinite scroll.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, GoldButton } from "@/components/site/Primitives";
import { PostCard } from "@/components/community/PostCard";
import { PostComposer } from "@/components/community/PostComposer";
import { useAuth } from "@/hooks/useAuth";
import { useCommunityFeed } from "@/hooks/useCommunity";
import type { FeedMode } from "@/lib/api/communityClient";
import { seo, breadcrumbLd, collectionPageLd } from "@/lib/seo";

export const Route = createFileRoute("/community/")({
  head: () =>
    seo({
      title: "Chess Community Online — Chess Players Forum | ChessOx",
      description:
        "Join the ChessOx online chess community. Follow chess players, share games and ideas, discuss openings and tactics, and browse trending and latest posts from the chess community.",
      keywords: [
        "online chess community",
        "chess players community",
        "chess community online",
        "chess discussion forum",
        "chess social network",
      ],
      path: "/community",
      jsonLd: [
        collectionPageLd({
          name: "Chess Community — ChessOx",
          description:
            "The ChessOx community feed where chess players post, follow each other and discuss the game across Following, For You, Trending and Latest tabs.",
          path: "/community",
          about: ["Online chess community", "Chess players community", "Chess discussion forum"],
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Community", path: "/community" },
        ]),
      ],
    }),
  component: CommunityHome,
});

const TABS: { mode: FeedMode; label: string; authOnly?: boolean }[] = [
  { mode: "following", label: "Following", authOnly: true },
  { mode: "foryou", label: "For You" },
  { mode: "trending", label: "Trending" },
  { mode: "latest", label: "Latest" },
];

export function FeedList({
  feed,
  emptyText,
}: {
  feed: ReturnType<typeof useCommunityFeed>;
  emptyText: string;
}) {
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = feed;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const posts = data?.pages.flat() ?? [];

  if (feed.isError) {
    return (
      <div className="grid place-items-center py-16 text-red-500">
        Error loading feed: {(feed.error as Error)?.message || "Unknown error"}
      </div>
    );
  }

  if (isLoading)
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  if (posts.length === 0)
    return <Card className="p-8 text-center text-sm text-muted-foreground">{emptyText}</Card>;

  return (
    <div className="space-y-3">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
      <div ref={sentinelRef} />
      {isFetchingNextPage && (
        <div className="grid place-items-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gold" />
        </div>
      )}
    </div>
  );
}

function CommunityHome() {
  const { user } = useAuth();
  const [mode, setMode] = useState<FeedMode>(user ? "following" : "foryou");
  const feed = useCommunityFeed({ mode });

  useEffect(() => {
    if (!user && mode === "following") setMode("foryou");
  }, [user, mode]);

  return (
    <div>
      <div className="mb-4 flex overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
        {TABS.filter((t) => !t.authOnly || user).map((t) => (
          <button
            key={t.mode}
            type="button"
            onClick={() => setMode(t.mode)}
            className={`flex-1 whitespace-nowrap px-4 py-2.5 text-sm transition ${
              mode === t.mode
                ? "border-b-2 border-gold font-medium text-gold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {user ? (
        <div className="mb-4">
          <PostComposer />
        </div>
      ) : (
        <Card className="mb-4 flex items-center justify-between gap-4 p-4">
          <p className="text-sm text-muted-foreground">
            Join the conversation — share positions, puzzles and analysis.
          </p>
          <Link to="/login">
            <GoldButton className="!px-5 !py-2">Sign in</GoldButton>
          </Link>
        </Card>
      )}

      <FeedList
        feed={feed}
        emptyText={
          mode === "following"
            ? "Posts from people you follow will appear here. Find players in Explore!"
            : "No posts yet. Be the first to share something!"
        }
      />
    </div>
  );
}
