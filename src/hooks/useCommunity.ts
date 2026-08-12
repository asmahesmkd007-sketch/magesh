// =====================================================================
// COMMUNITY HOOKS
// ---------------------------------------------------------------------
// Infinite feeds, realtime invalidation, and optimistic interactions for
// the ChessOX community. All server calls live in lib/api/communityClient.
// =====================================================================
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import * as api from "@/lib/api/communityClient";
import type { CommunityPost, FeedMode } from "@/lib/api/communityClient";

// ---------------------------------------------------------------------
// Feeds
// ---------------------------------------------------------------------
export function useCommunityFeed(opts: {
  mode?: FeedMode;
  author?: string;
  search?: string;
  tag?: string;
  enabled?: boolean;
}) {
  const { mode = "latest", author, search, tag, enabled = true } = opts;
  return useInfiniteQuery({
    queryKey: ["community_feed", mode, author ?? null, search ?? null, tag ?? null],
    queryFn: ({ pageParam }) =>
      api.fetchFeed({ mode, offset: pageParam as number, author, search, tag }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < api.PAGE_SIZE ? undefined : pages.length * api.PAGE_SIZE,
    enabled,
    staleTime: 15_000,
    retry: false,
  });
}

/** Subscribe once per mounted feed surface; invalidates feed queries on writes. */
export function useCommunityRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      // Fast response for real-time post & comment updates
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["community_feed"], type: "active" });
        queryClient.refetchQueries({ queryKey: ["community_post"], type: "active" });
        queryClient.refetchQueries({ queryKey: ["community_comments"], type: "active" });
      }, 150);
    };
    const channel = supabase
      .channel("community_v2")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_posts" },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_comments" },
        invalidate,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

export function useCommunityPost(id: string | undefined) {
  return useQuery({
    queryKey: ["community_post", id],
    queryFn: () => api.fetchPost(id!),
    enabled: !!id,
  });
}

export function useCommunityComments(postId: string | undefined) {
  return useQuery({
    queryKey: ["community_comments", postId],
    queryFn: () => api.fetchComments(postId!),
    enabled: !!postId,
  });
}

export function useCommunityProfile(username: string | undefined) {
  return useQuery({
    queryKey: ["community_profile", username?.toLowerCase()],
    queryFn: () => api.fetchCommunityProfile(username!),
    enabled: !!username,
  });
}

export function useLeaderboard(kind: "score" | "posts" | "comments" | "followers", limit = 10) {
  return useQuery({
    queryKey: ["community_leaderboard", kind, limit],
    queryFn: () => api.fetchLeaderboard(kind, limit),
    staleTime: 60_000,
  });
}

export function useSuggestedUsers(limit = 5) {
  return useQuery({
    queryKey: ["community_suggested", limit],
    queryFn: () => api.fetchSuggestedUsers(limit),
    staleTime: 60_000,
  });
}

export function useTrendingTags() {
  return useQuery({
    queryKey: ["community_tags"],
    queryFn: () => api.fetchTrendingTags(),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------
// Optimistic cache patching
// ---------------------------------------------------------------------
type FeedPages = { pages: CommunityPost[][]; pageParams: unknown[] };

function patchPostEverywhere(
  queryClient: ReturnType<typeof useQueryClient>,
  postId: string,
  patch: (p: CommunityPost) => CommunityPost,
) {
  queryClient.setQueriesData<FeedPages>({ queryKey: ["community_feed"] }, (old) =>
    old
      ? {
          ...old,
          pages: old.pages.map((page) => page.map((p) => (p.id === postId ? patch(p) : p))),
        }
      : old,
  );
  queryClient.setQueriesData<CommunityPost | null>(
    { queryKey: ["community_post", postId] },
    (old) => (old ? patch(old) : old),
  );
}

// ---------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------
export function useCommunityActions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const requireAuth = (): string => {
    if (!user) throw new Error("Sign in to interact with the community.");
    return user.id;
  };

  const invalidateFeeds = () => {
    queryClient.invalidateQueries({ queryKey: ["community_feed"] });
  };

  const reactToPost = useMutation({
    mutationFn: ({ postId, reaction }: { postId: string; reaction: "like" | "dislike" }) => {
      requireAuth();
      return api.react("post", postId, reaction);
    },
    onMutate: async ({ postId, reaction }) => {
      patchPostEverywhere(queryClient, postId, (p) => {
        const prev = p.my_reaction;
        const next = prev === reaction ? null : reaction;
        let { likes_count, dislikes_count } = p;
        if (prev === "like") likes_count--;
        if (prev === "dislike") dislikes_count--;
        if (next === "like") likes_count++;
        if (next === "dislike") dislikes_count++;
        return {
          ...p,
          my_reaction: next,
          likes_count,
          dislikes_count,
          score: likes_count - dislikes_count,
        };
      });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to react");
      invalidateFeeds();
    },
  });

  const reactToComment = useMutation({
    mutationFn: ({ commentId, reaction }: { commentId: string; reaction: "like" | "dislike" }) => {
      requireAuth();
      return api.react("comment", commentId, reaction);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["community_comments"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to react"),
  });

  const follow = useMutation({
    mutationFn: (targetId: string) => {
      requireAuth();
      return api.toggleFollow(targetId);
    },
    onSuccess: (nowFollowing, targetId) => {
      queryClient.setQueriesData<FeedPages>({ queryKey: ["community_feed"] }, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) =>
                page.map((p) =>
                  p.user_id === targetId ? { ...p, is_following_author: nowFollowing } : p,
                ),
              ),
            }
          : old,
      );
      queryClient.setQueriesData<api.CommunityUserLite[]>({ queryKey: ["community_leaderboard"] }, (old) =>
        old
          ? old.map((u) => (u.id === targetId ? { ...u, is_following: nowFollowing } : u))
          : old,
      );
      queryClient.setQueriesData<api.CommunityUserLite[]>({ queryKey: ["community_suggested"] }, (old) =>
        old
          ? old.map((u) => (u.id === targetId ? { ...u, is_following: nowFollowing } : u))
          : old,
      );
      queryClient.invalidateQueries({ queryKey: ["community_profile"] });
      queryClient.invalidateQueries({ queryKey: ["community_suggested"] });
      queryClient.invalidateQueries({ queryKey: ["community_leaderboard"] });
      toast.success(nowFollowing ? "Following" : "Unfollowed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to follow"),
  });

  const bookmark = useMutation({
    mutationFn: ({ postId, collection }: { postId: string; collection?: string }) => {
      requireAuth();
      return api.toggleBookmark(postId, collection);
    },
    onMutate: async ({ postId }) => {
      patchPostEverywhere(queryClient, postId, (p) => ({
        ...p,
        is_bookmarked: !p.is_bookmarked,
        bookmarks_count: p.bookmarks_count + (p.is_bookmarked ? -1 : 1),
      }));
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["community_bookmarks"] });
      toast.success(saved ? "Saved to bookmarks" : "Removed from bookmarks");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to bookmark");
      invalidateFeeds();
    },
  });

  const vote = useMutation({
    mutationFn: ({ postId, option }: { postId: string; option: number }) => {
      requireAuth();
      return api.votePoll(postId, option);
    },
    onMutate: async ({ postId, option }) => {
      patchPostEverywhere(queryClient, postId, (p) => {
        if (!p.poll_counts) return p;
        const counts = [...p.poll_counts];
        if (p.my_poll_vote != null && counts[p.my_poll_vote] > 0) counts[p.my_poll_vote]--;
        counts[option] = (counts[option] ?? 0) + 1;
        return { ...p, poll_counts: counts, my_poll_vote: option };
      });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Vote failed");
      invalidateFeeds();
    },
  });

  const createPost = useMutation({
    mutationFn: (post: api.NewPost) => api.createPost(requireAuth(), post),
    onSuccess: (newPost) => {
      queryClient.setQueriesData<FeedPages>({ queryKey: ["community_feed"] }, (old) => {
        if (!old || !old.pages || old.pages.length === 0) {
          return { pages: [[newPost]], pageParams: [0] };
        }
        const exists = old.pages.some((page) => page.some((p) => p.id === newPost.id));
        if (exists) return old;
        return {
          ...old,
          pages: [[newPost, ...old.pages[0]], ...old.pages.slice(1)],
        };
      });
      queryClient.refetchQueries({ queryKey: ["community_feed"], type: "active" });
      queryClient.invalidateQueries({ queryKey: ["community_profile"] });
      toast.success("Posted!");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to post"),
  });

  const removePost = useMutation({
    mutationFn: (postId: string) => api.deletePost(postId),
    onSuccess: () => {
      invalidateFeeds();
      toast.success("Post deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const comment = useMutation({
    mutationFn: (args: {
      postId: string;
      content: string;
      parentId?: string | null;
      fen?: string | null;
      pgn?: string | null;
    }) =>
      api.addComment(requireAuth(), args.postId, args.content, args.parentId, args.fen, args.pgn),
    onSuccess: (_d, args) => {
      queryClient.invalidateQueries({ queryKey: ["community_comments", args.postId] });
      patchPostEverywhere(queryClient, args.postId, (p) => ({
        ...p,
        comments_count: p.comments_count + 1,
      }));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to comment"),
  });

  const removeComment = useMutation({
    mutationFn: ({ id }: { id: string; postId: string }) => api.deleteComment(id),
    onSuccess: (_d, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ["community_comments", postId] });
      patchPostEverywhere(queryClient, postId, (p) => ({
        ...p,
        comments_count: Math.max(p.comments_count - 1, 0),
      }));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const share = useMutation({
    mutationFn: async (postId: string) => {
      const url = `${window.location.origin}/community/post/${postId}`;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(url);
        } else {
          const ta = document.createElement("textarea");
          ta.value = url;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
      } catch (err) {
        console.warn("Clipboard write error:", err);
      }
      await api.sharePost(postId).catch(() => undefined);
      return url;
    },
    onSuccess: (_url, postId) => {
      patchPostEverywhere(queryClient, postId, (p) => ({
        ...p,
        shares_count: p.shares_count + 1,
      }));
      toast.success("Link copied to clipboard");
    },
    onError: () => toast.error("Could not copy link"),
  });

  const report = useMutation({
    mutationFn: (args: {
      targetType: "post" | "comment" | "user";
      targetId: string;
      reason: api.ReportReason;
      details?: string;
    }) =>
      api.reportContent(requireAuth(), args.targetType, args.targetId, args.reason, args.details),
    onSuccess: () => toast.success("Report submitted. Our moderators will review it."),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to report"),
  });

  const mute = useMutation({
    mutationFn: ({ targetId, muted }: { targetId: string; muted: boolean }) =>
      api.toggleMute(requireAuth(), targetId, muted),
    onSuccess: (_d, { muted }) => {
      invalidateFeeds();
      queryClient.invalidateQueries({ queryKey: ["community_profile"] });
      toast.success(muted ? "Unmuted" : "Muted — you won't see their posts");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const block = useMutation({
    mutationFn: ({ targetId, blocked }: { targetId: string; blocked: boolean }) =>
      api.toggleBlock(requireAuth(), targetId, blocked),
    onSuccess: (_d, { blocked }) => {
      invalidateFeeds();
      queryClient.invalidateQueries({ queryKey: ["community_profile"] });
      toast.success(blocked ? "Unblocked" : "Blocked");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const hidePost = useMutation({
    mutationFn: (postId: string) => api.hidePostForMe(requireAuth(), postId),
    onSuccess: () => {
      invalidateFeeds();
      toast.success("Post hidden");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return {
    user,
    reactToPost,
    reactToComment,
    follow,
    bookmark,
    vote,
    createPost,
    removePost,
    comment,
    removeComment,
    share,
    report,
    mute,
    block,
    hidePost,
  };
}

export function useBookmarks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["community_bookmarks", user?.id],
    queryFn: () => api.fetchBookmarks(user!.id),
    enabled: !!user,
  });
}
