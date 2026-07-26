// Post detail: full post + nested comment thread.
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card } from "@/components/site/Primitives";
import { PostCard } from "@/components/community/PostCard";
import { CommentThread } from "@/components/community/CommentThread";
import { useCommunityPost } from "@/hooks/useCommunity";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/community/post/$id")({
  head: () =>
    noindexSeo("Community Post — ChessOx", "A post from the ChessOx chess community feed."),
  component: PostDetail,
});

function PostDetail() {
  const { id } = Route.useParams();
  const { data: post, isLoading } = useCommunityPost(id);

  return (
    <div>
      <Link
        to="/community"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to feed
      </Link>
      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : !post ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          This post doesn't exist or was removed.
        </Card>
      ) : (
        <div className="space-y-4">
          <PostCard post={post} detail />
          <Card className="p-4 sm:p-5">
            <CommentThread postId={post.id} />
          </Card>
        </div>
      )}
    </div>
  );
}
