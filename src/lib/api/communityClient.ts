// =====================================================================
// COMMUNITY SERVICE LAYER (client)
// ---------------------------------------------------------------------
// Chess-first social platform: feeds, posts (text/image/FEN/PGN/puzzle/
// poll/...), reactions, nested comments, follows, mutes, blocks,
// bookmarks, reports, leaderboards, achievements.
// Backend: supabase/migrations_community.sql — every mutation is either
// RLS-guarded or a SECURITY DEFINER RPC that re-checks auth.uid().
// =====================================================================
import { supabase } from "@/integrations/supabase/client";

// The community tables/RPCs are newer than the generated types, so route
// calls through a loosely-typed handle (same pattern as adminClient).
const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------
export type PostType =
  | "text" | "image" | "fen" | "pgn" | "puzzle" | "poll" | "analysis"
  | "question" | "opening" | "tournament" | "news" | "meme" | "game" | "link";

export type CommunityAuthor = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  title: string | null;
  country: string | null;
  premium_tier: string | null;
  community_score: number;
  iq_level: number | null;
  followers_count: number;
};

export type CommunityPost = {
  id: string;
  user_id: string;
  post_type: PostType;
  content: string;
  media_url: string | null;
  link_url: string | null;
  fen: string | null;
  pgn: string | null;
  puzzle_solution: string | null;
  poll_options: string[] | null;
  poll_ends_at: string | null;
  tags: string[];
  likes_count: number;
  dislikes_count: number;
  comments_count: number;
  shares_count: number;
  bookmarks_count: number;
  score: number;
  is_pinned: boolean;
  is_hidden: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  author: CommunityAuthor | null;
  my_reaction: "like" | "dislike" | null;
  is_bookmarked: boolean;
  is_following_author: boolean;
  poll_counts: number[] | null;
  my_poll_vote: number | null;
};

export type CommunityComment = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  fen: string | null;
  pgn: string | null;
  likes_count: number;
  dislikes_count: number;
  replies_count: number;
  created_at: string;
  author: Pick<
    CommunityAuthor,
    "id" | "username" | "display_name" | "avatar_url" | "premium_tier" | "community_score"
  > | null;
  my_reaction: "like" | "dislike" | null;
};

export type CommunityProfile = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  country: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  website: string | null;
  title: string | null;
  youtube_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  premium_tier: string | null;
  iq_level: number | null;
  community_score: number;
  created_at: string;
  followers_count: number;
  following_count: number;
  posts_count: number;
  comments_count: number;
  is_following: boolean;
  follows_me: boolean;
  is_muted: boolean;
  is_blocked: boolean;
  mutual_followers: number;
  achievements: { code: string; awarded_at: string }[];
};

export type CommunityUserLite = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  premium_tier: string | null;
  community_score: number;
  followers_count: number;
  is_following?: boolean;
  metric?: number;
};

export type FeedMode = "following" | "foryou" | "trending" | "latest";
export type ReportReason =
  | "spam" | "abuse" | "harassment" | "copyright" | "duplicate" | "fake_information" | "other";

export const ACHIEVEMENT_LABELS: Record<string, string> = {
  first_post: "First Post",
  posts_10: "10 Posts",
  top_contributor: "Top Contributor",
  first_comment: "First Comment",
  comments_100: "100 Comments",
  first_follower: "First Follower",
  followers_100: "100 Followers",
  score_1000: "1000 Community Score",
};

// ---------------------------------------------------------------------
// Feeds & posts
// ---------------------------------------------------------------------
export const PAGE_SIZE = 15;

export function fetchFeed(opts: {
  mode?: FeedMode;
  offset?: number;
  limit?: number;
  author?: string;
  search?: string;
  tag?: string;
}) {
  return rpc<CommunityPost[]>("community_feed", {
    p_mode: opts.mode ?? "latest",
    p_limit: opts.limit ?? PAGE_SIZE,
    p_offset: opts.offset ?? 0,
    p_author: opts.author ?? null,
    p_search: opts.search ?? null,
    p_tag: opts.tag ?? null,
  });
}

export const fetchPost = (id: string) =>
  rpc<CommunityPost | null>("community_get_post", { p_id: id });

export const fetchComments = (postId: string) =>
  rpc<CommunityComment[]>("community_get_comments", { p_post_id: postId });

export type NewPost = {
  post_type: PostType;
  content: string;
  media_url?: string | null;
  link_url?: string | null;
  fen?: string | null;
  pgn?: string | null;
  puzzle_solution?: string | null;
  poll_options?: string[] | null;
  tags?: string[];
};

export async function createPost(userId: string, post: NewPost): Promise<string> {
  const { data, error } = await db
    .from("community_posts")
    .insert({ user_id: userId, ...post, tags: post.tags ?? [] })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function deletePost(id: string) {
  const { error } = await db.from("community_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addComment(
  userId: string,
  postId: string,
  content: string,
  parentId?: string | null,
  fen?: string | null,
  pgn?: string | null,
) {
  const { error } = await db.from("community_comments").insert({
    user_id: userId,
    post_id: postId,
    parent_id: parentId ?? null,
    content,
    fen: fen ?? null,
    pgn: pgn ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function editComment(id: string, content: string) {
  const { error } = await db.from("community_comments").update({ content }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteComment(id: string) {
  const { error } = await db.from("community_comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------
// Interactions (all toggle-style RPCs, server-authoritative)
// ---------------------------------------------------------------------
export const react = (targetType: "post" | "comment", targetId: string, reaction: "like" | "dislike") =>
  rpc<"like" | "dislike" | null>("community_react", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reaction: reaction,
  });

export const toggleFollow = (targetId: string) =>
  rpc<boolean>("community_toggle_follow", { p_target: targetId });

export const toggleBookmark = (postId: string, collection = "Favorites") =>
  rpc<boolean>("community_toggle_bookmark", { p_post_id: postId, p_collection: collection });

export const votePoll = (postId: string, option: number) =>
  rpc<void>("community_vote_poll", { p_post_id: postId, p_option: option });

export const sharePost = (postId: string) =>
  rpc<void>("community_share_post", { p_post_id: postId });

export async function hidePostForMe(userId: string, postId: string) {
  const { error } = await db
    .from("community_hidden_posts")
    .upsert({ user_id: userId, post_id: postId });
  if (error) throw new Error(error.message);
}

export async function toggleMute(userId: string, targetId: string, muted: boolean) {
  const q = db.from("community_mutes");
  const { error } = muted
    ? await q.delete().eq("user_id", userId).eq("muted_id", targetId)
    : await q.upsert({ user_id: userId, muted_id: targetId });
  if (error) throw new Error(error.message);
}

export async function toggleBlock(userId: string, targetId: string, blocked: boolean) {
  const q = db.from("community_blocks");
  const { error } = blocked
    ? await q.delete().eq("user_id", userId).eq("blocked_id", targetId)
    : await q.upsert({ user_id: userId, blocked_id: targetId });
  if (error) throw new Error(error.message);
}

export async function removeFollower(myId: string, followerId: string) {
  const { error } = await db
    .from("community_follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", myId);
  if (error) throw new Error(error.message);
}

export async function reportContent(
  reporterId: string,
  targetType: "post" | "comment" | "user",
  targetId: string,
  reason: ReportReason,
  details?: string,
) {
  const { error } = await db.from("community_reports").insert({
    reporter_id: reporterId,
    target_type: targetType,
    target_id: targetId,
    reason,
    details: details ?? null,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error("You already reported this.");
    throw new Error(error.message);
  }
}

// ---------------------------------------------------------------------
// Profiles, follows, discovery
// ---------------------------------------------------------------------
export const fetchCommunityProfile = (username: string) =>
  rpc<CommunityProfile | null>("community_profile", { p_username: username });

export const fetchFollowList = (userId: string, kind: "followers" | "following", limit = 50) =>
  rpc<CommunityUserLite[]>("community_follow_list", { p_user: userId, p_kind: kind, p_limit: limit });

export const fetchLeaderboard = (kind: "score" | "posts" | "comments" | "followers", limit = 10) =>
  rpc<CommunityUserLite[]>("community_leaderboard", { p_kind: kind, p_limit: limit });

export const fetchSuggestedUsers = (limit = 5) =>
  rpc<CommunityUserLite[]>("community_suggested_users", { p_limit: limit });

export const searchUsers = (query: string, limit = 10) =>
  rpc<CommunityUserLite[]>("community_search_users", { p_query: query, p_limit: limit });

export const fetchTrendingTags = (limit = 8) =>
  rpc<{ tag: string; count: number }[]>("community_trending_tags", { p_limit: limit });

// ---------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------
export type BookmarkRow = { post_id: string; collection: string; created_at: string };

export async function fetchBookmarks(userId: string): Promise<BookmarkRow[]> {
  const { data, error } = await db
    .from("community_bookmarks")
    .select("post_id,collection,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as BookmarkRow[];
}

/** Hydrate bookmarked posts with viewer flags (bookmark lists are small). */
export async function fetchPostsByIds(ids: string[]): Promise<CommunityPost[]> {
  const results = await Promise.all(ids.map((id) => fetchPost(id).catch(() => null)));
  return results.filter((p): p is CommunityPost => !!p);
}

export type UserCommentRow = {
  id: string;
  post_id: string;
  content: string;
  likes_count: number;
  created_at: string;
};

export async function fetchUserComments(userId: string, limit = 50): Promise<UserCommentRow[]> {
  const { data, error } = await db
    .from("community_comments")
    .select("id,post_id,content,likes_count,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as UserCommentRow[];
}

export async function setBookmarkCollection(userId: string, postId: string, collection: string) {
  const { error } = await db
    .from("community_bookmarks")
    .update({ collection })
    .eq("user_id", userId)
    .eq("post_id", postId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------
// Media upload (community-media bucket, per-user folder enforced by RLS)
// ---------------------------------------------------------------------
export async function uploadCommunityImage(userId: string, file: File): Promise<string> {
  if (!/^image\//.test(file.type)) throw new Error("Only image files are allowed.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB.");
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await db.storage.from("community-media").upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
  });
  if (error) throw new Error(error.message);
  const { data } = db.storage.from("community-media").getPublicUrl(path);
  return data.publicUrl as string;
}

// ---------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------
export type CommunityStats = {
  users: number;
  online: number;
  posts: number;
  comments: number;
  likes: number;
  follows: number;
  open_reports: number;
  posts_7d: number;
};

export const fetchCommunityStats = () => rpc<CommunityStats>("admin_community_stats");

export const resolveReport = (reportId: string, status: "resolved" | "dismissed" | "open") =>
  rpc<void>("admin_resolve_report", { p_report_id: reportId, p_status: status });

export type CommunityReport = {
  id: string;
  reporter_id: string;
  target_type: "post" | "comment" | "user";
  target_id: string;
  reason: ReportReason;
  details: string | null;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
};

export async function fetchReports(status?: string): Promise<CommunityReport[]> {
  let q = db
    .from("community_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as CommunityReport[];
}
