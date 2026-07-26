// Bookmarks with collections (Favorites / Study Later / Tournament Games /
// Analysis + any custom collection created by moving a bookmark).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bookmark, FolderInput, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, GoldButton } from "@/components/site/Primitives";
import { PostCard } from "@/components/community/PostCard";
import { useAuth } from "@/hooks/useAuth";
import { useBookmarks } from "@/hooks/useCommunity";
import { fetchPostsByIds, setBookmarkCollection } from "@/lib/api/communityClient";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/community/bookmarks")({
  head: () =>
    noindexSeo(
      "Saved Community Posts — ChessOx",
      "The community posts you have bookmarked on ChessOx.",
      "noindex, nofollow",
    ),
  component: Bookmarks,
});

const DEFAULT_COLLECTIONS = ["Favorites", "Study Later", "Tournament Games", "Analysis"];

function Bookmarks() {
  const { user, loading } = useAuth();
  const { data: bookmarks = [], isLoading } = useBookmarks();
  const [collection, setCollection] = useState<string>("All");
  const queryClient = useQueryClient();

  const collections = useMemo(() => {
    const set = new Set(DEFAULT_COLLECTIONS);
    bookmarks.forEach((b) => set.add(b.collection));
    return ["All", ...set];
  }, [bookmarks]);

  const visible = useMemo(
    () => (collection === "All" ? bookmarks : bookmarks.filter((b) => b.collection === collection)),
    [bookmarks, collection],
  );

  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ["community_bookmark_posts", visible.map((b) => b.post_id).join(",")],
    queryFn: () => fetchPostsByIds(visible.map((b) => b.post_id)),
    enabled: visible.length > 0,
  });

  const movePost = async (postId: string) => {
    const target = window.prompt(
      `Move to which collection?\n(${DEFAULT_COLLECTIONS.join(", ")} or type a new name)`,
    );
    if (!target?.trim() || !user) return;
    try {
      await setBookmarkCollection(user.id, postId, target.trim());
      queryClient.invalidateQueries({ queryKey: ["community_bookmarks"] });
      toast.success(`Moved to ${target.trim()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to move");
    }
  };

  if (!loading && !user)
    return (
      <Card className="p-8 text-center">
        <Bookmark className="mx-auto h-10 w-10 text-gold/30" />
        <p className="mt-4 text-sm text-muted-foreground">Sign in to see your bookmarks.</p>
        <Link to="/login" className="mt-4 inline-block">
          <GoldButton>Sign in</GoldButton>
        </Link>
      </Card>
    );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {collections.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCollection(c)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              collection === c
                ? "border-gold/50 bg-gold/10 text-gold"
                : "border-white/10 text-muted-foreground hover:border-gold/30"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading || postsLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : posts.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {collection === "All"
            ? "No bookmarks yet. Tap the bookmark icon on any post to save it."
            : `Nothing in “${collection}” yet.`}
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <div key={p.id} className="relative">
              <PostCard post={p} />
              <button
                type="button"
                onClick={() => movePost(p.id)}
                title="Move to collection"
                className="absolute right-14 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.05] hover:text-gold"
              >
                <FolderInput className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
