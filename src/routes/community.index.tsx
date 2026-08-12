// Community home: feed tabs (Following / For You / Trending / Latest),
// composer, infinite scroll.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, GoldButton } from "@/components/site/Primitives";
import { FeedList } from "@/components/community/FeedList";
import { PostComposer } from "@/components/community/PostComposer";
import { useAuth, useProfile } from "@/hooks/useAuth";
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
  { mode: "foryou", label: "For You" },
  { mode: "following", label: "Following", authOnly: true },
  { mode: "latest", label: "Latest" },
  { mode: "trending", label: "Trending" },
];

function CommunityHome() {
  const { user } = useAuth();
  const { profile } = useProfile(user?.id);
  const [mode, setMode] = useState<FeedMode>("foryou");
  const username = profile?.username ?? (user?.user_metadata?.username as string | undefined);

  // For You mode only shows posts created by the currently logged-in user
  const feed = useCommunityFeed({
    mode: mode === "foryou" ? "foryou" : mode,
    author: mode === "foryou" && username ? username : undefined,
  });

  useEffect(() => {
    if (!user && mode === "following") setMode("foryou");
  }, [user, mode]);

  // Client-side safety filter: if mode is "foryou", strictly include only posts authored by the user
  const filteredFeed =
    mode === "foryou" && user
      ? {
          ...feed,
          data: feed.data
            ? {
                ...feed.data,
                pages: feed.data.pages.map((page) =>
                  page.filter(
                    (p) => p.user_id === user.id || (username && p.author?.username === username),
                  ),
                ),
              }
            : undefined,
        }
      : feed;

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
          <PostComposer
            onPosted={() => {
              setMode("foryou");
              feed.refetch();
            }}
          />
        </div>
      ) : (
        <Card className="mb-4 flex items-center justify-between gap-4 p-4">
          <p className="text-sm text-muted-foreground">
            Join the conversation — share positions, puzzles and analysis.
          </p>
          <Link to="/auth">
            <GoldButton className="!px-5 !py-2">Sign in</GoldButton>
          </Link>
        </Card>
      )}

      <FeedList
        feed={filteredFeed as typeof feed}
        emptyText={
          mode === "foryou"
            ? "You haven't created any posts yet. Share your first position or thought above!"
            : mode === "following"
              ? "Posts from people you follow will appear here. Find players in Explore!"
              : "No posts yet. Be the first to share something!"
        }
      />
    </div>
  );
}
