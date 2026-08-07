// Public profile (X-style): banner, avatar, bio, stats, follow/mute/
// block/report, followers & following modals, tabbed content.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Award,
  BadgeCheck,
  Ban,
  Calendar,
  Flag,
  Globe,
  Link2,
  Loader2,
  Mail,
  MapPin,
  MoreHorizontal,
  TrendingUp,
  VolumeX,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, GhostButton, GoldButton } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { SeasonShield } from "@/components/ranking/SeasonShield";
import { CommunityLayout } from "@/components/community/CommunityLayout";
import { PostCard, ReportDialog } from "@/components/community/PostCard";
import { FeedList } from "@/components/community/FeedList";
import { useAuth } from "@/hooks/useAuth";
import {
  useCommunityActions,
  useCommunityFeed,
  useCommunityProfile,
  useCommunityRealtime,
} from "@/hooks/useCommunity";
import { ACHIEVEMENT_LABELS, fetchFollowList, fetchUserComments } from "@/lib/api/communityClient";
import type { CommunityUserLite } from "@/lib/api/communityClient";
import { noindexSeo } from "@/lib/seo";

import { RequireAuth } from "@/components/auth/RequireAuth";

export const Route = createFileRoute("/u/$username")({
  head: ({ params }) =>
    noindexSeo(
      `@${params.username} — Chess Player Profile | ChessOx`,
      `The ChessOx profile of @${params.username}: chess ratings, results, achievements and recent games.`,
    ),
  component: () => (
    <RequireAuth>
      <PublicProfile />
    </RequireAuth>
  ),
});

type Tab = "posts" | "media" | "comments" | "achievements";

function FollowListModal({
  userId,
  kind,
  onClose,
}: {
  userId: string;
  kind: "followers" | "following";
  onClose: () => void;
}) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["community_follow_list", userId, kind],
    queryFn: () => fetchFollowList(userId, kind),
  });
  const { follow, user } = useCommunityActions();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-[#101317] p-5 shadow-luxe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium capitalize">{kind}</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        {isLoading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
          </div>
        ) : data.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Nobody here yet.</p>
        ) : (
          data.map((u: CommunityUserLite) => (
            <div key={u.id} className="flex items-center gap-2.5 py-2">
              <Link to="/u/$username" params={{ username: u.username }} onClick={onClose}>
                <UserAvatar avatarUrl={u.avatar_url} displayName={u.full_name} size="sm" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  to="/u/$username"
                  params={{ username: u.username }}
                  onClick={onClose}
                  className="block truncate text-xs font-medium hover:underline"
                >
                  {u.full_name}
                </Link>
                <div className="truncate text-[11px] text-muted-foreground">@{u.username}</div>
              </div>
              {user && user.id !== u.id && (
                <button
                  type="button"
                  onClick={() => follow.mutate(u.id)}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                    u.is_following
                      ? "border-white/15 text-muted-foreground"
                      : "border-gold/30 text-gold hover:bg-gold/10"
                  }`}
                >
                  {u.is_following ? "Following" : "Follow"}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CommentsTab({ userId }: { userId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["community_user_comments", userId],
    queryFn: () => fetchUserComments(userId),
  });
  if (isLoading)
    return (
      <div className="grid place-items-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gold" />
      </div>
    );
  if (data.length === 0)
    return <Card className="p-8 text-center text-sm text-muted-foreground">No comments yet.</Card>;
  return (
    <div className="space-y-2">
      {data.map((c) => (
        <Link key={c.id} to="/community/post/$id" params={{ id: c.post_id }}>
          <Card className="p-4 transition hover:border-gold/20">
            <p className="line-clamp-3 whitespace-pre-wrap text-sm">{c.content}</p>
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              {c.likes_count} likes · {new Date(c.created_at).toLocaleDateString("en-IN")}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function PublicProfile() {
  useCommunityRealtime();
  const { username } = Route.useParams();
  const { user } = useAuth();
  const { data: profile, isLoading } = useCommunityProfile(username);
  const actions = useCommunityActions();
  const [tab, setTab] = useState<Tab>("posts");
  const [modal, setModal] = useState<"followers" | "following" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);

  const postsFeed = useCommunityFeed({
    mode: "latest",
    author: profile?.id,
    enabled: !!profile && tab === "posts",
  });
  const mediaFeed = useCommunityFeed({
    mode: "latest",
    author: profile?.id,
    enabled: !!profile && tab === "media",
  });

  if (isLoading)
    return (
      <CommunityLayout>
        <div className="grid place-items-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-gold" />
        </div>
      </CommunityLayout>
    );

  if (!profile)
    return (
      <CommunityLayout>
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No player named <span className="text-gold">@{username}</span> found.
          </p>
        </Card>
      </CommunityLayout>
    );

  const isOwn = user?.id === profile.id;
  const joined = new Date(profile.created_at).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const stat = (label: string, value: number, onClick?: () => void) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-sm ${onClick ? "hover:underline" : "cursor-default"}`}
    >
      <span className="font-medium text-foreground">{value}</span>{" "}
      <span className="text-muted-foreground">{label}</span>
    </button>
  );

  return (
    <CommunityLayout>
      <Card className="overflow-hidden !p-0">
        {/* banner */}
        <div className="h-36 w-full bg-[linear-gradient(120deg,#2a1a0a,#0c0e12)] sm:h-44">
          {profile.banner_url && (
            <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="px-4 pb-5 sm:px-6">
          <div className="-mt-10 flex items-end justify-between">
            <div className="flex items-center gap-4">
              <UserAvatar
                avatarUrl={profile.avatar_url}
                displayName={profile.full_name}
                size="xl"
                className="border-4 border-[#0d0f13]"
                shape="rounded-2xl"
              />
              <SeasonShield
                sp={profile.season_points ?? 0}
                rungId={profile.rung_id}
                size="lg"
                variant="full"
                className="shrink-0 mt-6"
              />
            </div>
            <div className="flex items-center gap-2 pb-1">
              {isOwn ? (
                <Link to="/settings">
                  <GhostButton className="!px-4 !py-1.5 text-xs">Edit profile</GhostButton>
                </Link>
              ) : (
                <>
                  <Link
                    to="/chat/dm/$username"
                    params={{ username: profile.username }}
                    title="Message"
                    className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-muted-foreground hover:border-gold/40 hover:text-gold"
                  >
                    <Mail className="h-4 w-4" />
                  </Link>
                  <div className="relative">
                    <button
                      type="button"
                      aria-label="More"
                      onClick={() => setMenuOpen((o) => !o)}
                      className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-muted-foreground hover:border-gold/40 hover:text-gold"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#101317] py-1 shadow-luxe">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                          onClick={() => {
                            navigator.clipboard.writeText(window.location.href);
                            toast.success("Profile link copied");
                            setMenuOpen(false);
                          }}
                        >
                          <Link2 className="h-3.5 w-3.5" /> Share profile
                        </button>
                        {user && (
                          <>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                              onClick={() => {
                                actions.mute.mutate({
                                  targetId: profile.id,
                                  muted: profile.is_muted,
                                });
                                setMenuOpen(false);
                              }}
                            >
                              <VolumeX className="h-3.5 w-3.5" />
                              {profile.is_muted ? "Unmute" : "Mute"} @{profile.username}
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-rose-400 hover:bg-white/[0.05]"
                              onClick={() => {
                                actions.block.mutate({
                                  targetId: profile.id,
                                  blocked: profile.is_blocked,
                                });
                                setMenuOpen(false);
                              }}
                            >
                              <Ban className="h-3.5 w-3.5" />
                              {profile.is_blocked ? "Unblock" : "Block"} @{profile.username}
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-rose-400 hover:bg-white/[0.05]"
                              onClick={() => {
                                setReporting(true);
                                setMenuOpen(false);
                              }}
                            >
                              <Flag className="h-3.5 w-3.5" /> Report
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {user && (
                    <GoldButton
                      onClick={() => actions.follow.mutate(profile.id)}
                      className={`!px-5 !py-1.5 text-xs ${profile.is_following ? "opacity-70" : ""}`}
                    >
                      {profile.is_following
                        ? "Following"
                        : profile.follows_me
                          ? "Follow back"
                          : "Follow"}
                    </GoldButton>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl font-medium">{profile.full_name}</h1>
              {profile.premium_tier && profile.premium_tier !== "free" && (
                <BadgeCheck className="h-5 w-5 text-gold" aria-label="Premium" />
              )}
              {profile.title && (
                <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[11px] text-gold">
                  {profile.title}
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              @{profile.username}
              {profile.follows_me && (
                <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px]">
                  Follows you
                </span>
              )}
            </div>
            {profile.bio && <p className="mt-2 whitespace-pre-wrap text-sm">{profile.bio}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {profile.country && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {profile.country}
                </span>
              )}
              {profile.website && (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-1 text-gold hover:underline"
                >
                  <Globe className="h-3.5 w-3.5" /> {profile.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Joined {joined}
              </span>
              <span className="flex items-center gap-1 text-gold">
                <TrendingUp className="h-3.5 w-3.5" /> {profile.community_score} score
              </span>
              {profile.iq_level != null && <span>IQ {profile.iq_level}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
              {stat("Following", profile.following_count, () => setModal("following"))}
              {stat("Followers", profile.followers_count, () => setModal("followers"))}
              {stat("Posts", profile.posts_count)}
              {stat("Comments", profile.comments_count)}
              {!isOwn && profile.mutual_followers > 0 && (
                <span className="text-xs text-muted-foreground">
                  {profile.mutual_followers} mutual follower
                  {profile.mutual_followers > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* tabs */}
        <div className="flex border-t border-white/5">
          {(
            [
              ["posts", "Posts"],
              ["media", "Media"],
              ["comments", "Comments"],
              ["achievements", "Achievements"],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-2.5 text-xs sm:text-sm ${
                tab === t
                  ? "border-b-2 border-gold font-medium text-gold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      <div className="mt-4">
        {tab === "posts" && <FeedList feed={postsFeed} emptyText="No posts yet." />}
        {tab === "media" && <MediaGrid feed={mediaFeed} />}
        {tab === "comments" && <CommentsTab userId={profile.id} />}
        {tab === "achievements" && (
          <Card className="p-5">
            {profile.achievements.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">No achievements yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {profile.achievements.map((a) => (
                  <div
                    key={a.code}
                    className="flex items-center gap-3 rounded-xl border border-gold/20 bg-gold/[0.04] p-3"
                  >
                    <Award className="h-6 w-6 text-gold" />
                    <div>
                      <div className="text-sm font-medium">
                        {ACHIEVEMENT_LABELS[a.code] ?? a.code}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(a.awarded_at).toLocaleDateString("en-IN")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      {modal && <FollowListModal userId={profile.id} kind={modal} onClose={() => setModal(null)} />}
      {reporting && (
        <ReportDialog
          onClose={() => setReporting(false)}
          onSubmit={(reason, details) => {
            actions.report.mutate({ targetType: "user", targetId: profile.id, reason, details });
            setReporting(false);
          }}
        />
      )}
    </CommunityLayout>
  );
}

function MediaGrid({ feed }: { feed: ReturnType<typeof useCommunityFeed> }) {
  const posts = (feed.data?.pages.flat() ?? []).filter((p) => p.media_url || p.fen || p.pgn);
  if (feed.isLoading)
    return (
      <div className="grid place-items-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gold" />
      </div>
    );
  if (posts.length === 0)
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No media or chess content yet.
      </Card>
    );
  return (
    <div className="space-y-3">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  );
}
