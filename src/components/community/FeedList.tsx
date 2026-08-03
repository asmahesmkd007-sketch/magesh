// Extracted from routes/community.index.tsx.
//
// It used to be exported from that route file and imported by two OTHER
// route files (community.explore, u.$username). A route-to-route import
// keeps the source route's module in the eager graph, so FeedList's
// `PostCard` import — and everything PostCard reaches — was pinned into the
// client ENTRY chunk and downloaded on every page, including the landing
// page. Living in its own module lets the three routes share it through a
// normal lazy chunk instead. Behaviour is unchanged.
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/site/Primitives";
import { PostCard } from "@/components/community/PostCard";
import type { useCommunityFeed } from "@/hooks/useCommunity";

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
