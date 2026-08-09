// One post in the feed / detail page: author header, typed chess content
// body, action row, overflow menu (bookmark, copy link, mute, hide,
// report, delete). All actions go through useCommunityActions.
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Bookmark,
  EyeOff,
  Flag,
  Heart,
  HeartOff,
  Link2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Share2,
  Trash2,
  TrendingUp,
  UserMinus,
  UserPlus,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { SeasonShield } from "@/components/ranking/SeasonShield";
import { FriendButton } from "@/components/friends/FriendButton";
import type { CommunityPost, ReportReason } from "@/lib/api/communityClient";
import { useCommunityActions } from "@/hooks/useCommunity";
import { FenViewer, PgnViewer, PuzzleViewer } from "./LazyPostViewers";

export function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const TYPE_LABEL: Partial<Record<CommunityPost["post_type"], string>> = {
  puzzle: "Puzzle",
  analysis: "Analysis",
  question: "Question",
  opening: "Opening",
  tournament: "Tournament",
  news: "News",
  meme: "Meme",
  poll: "Poll",
  game: "Game",
};

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "abuse", label: "Abuse" },
  { value: "harassment", label: "Harassment" },
  { value: "copyright", label: "Copyright" },
  { value: "duplicate", label: "Duplicate" },
  { value: "fake_information", label: "Fake information" },
  { value: "other", label: "Other" },
];

function PollBlock({ post }: { post: CommunityPost }) {
  const { vote, user } = useCommunityActions();
  const counts = post.poll_counts ?? [];
  const total = counts.reduce((a, b) => a + b, 0);
  const voted = post.my_poll_vote != null;
  return (
    <div className="mt-3 space-y-1.5">
      {(post.poll_options ?? []).map((opt, i) => {
        const pct = total ? Math.round(((counts[i] ?? 0) / total) * 100) : 0;
        const mine = post.my_poll_vote === i;
        return (
          <button
            type="button"
            key={i}
            disabled={!user}
            onClick={() => vote.mutate({ postId: post.id, option: i })}
            className={`relative block w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition ${
              mine ? "border-gold/50" : "border-white/10 hover:border-gold/30"
            }`}
          >
            {voted && (
              <span className="absolute inset-y-0 left-0 bg-gold/15" style={{ width: `${pct}%` }} />
            )}
            <span className="relative flex items-center justify-between gap-2">
              <span className={mine ? "text-gold" : ""}>{opt}</span>
              {voted && <span className="text-xs text-muted-foreground">{pct}%</span>}
            </span>
          </button>
        );
      })}
      <div className="text-xs text-muted-foreground">
        {total} vote{total === 1 ? "" : "s"}
      </div>
    </div>
  );
}

/** Turn @mentions and #tags in plain text into profile / tag links. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(@[A-Za-z0-9_]{2,32}|#[A-Za-z0-9_]{2,32})/g);
  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
      {parts.map((part, i) => {
        if (part.startsWith("@"))
          return (
            <Link
              key={i}
              to="/u/$username"
              params={{ username: part.slice(1) }}
              onClick={(e) => e.stopPropagation()}
              className="text-gold hover:underline"
            >
              {part}
            </Link>
          );
        if (part.startsWith("#"))
          return (
            <Link
              key={i}
              to="/community/explore"
              search={{ tag: part.slice(1), q: undefined }}
              onClick={(e) => e.stopPropagation()}
              className="text-emerald hover:underline"
            >
              {part}
            </Link>
          );
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function ActionButton({
  icon: Icon,
  count,
  active,
  activeClass = "text-gold",
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  active?: boolean;
  activeClass?: string;
  label: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition hover:bg-white/[0.05] ${
        active ? activeClass : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? "fill-current" : ""}`} />
      {count !== undefined && count > 0 && <span>{count}</span>}
    </button>
  );
}

export function PostCard({ post, detail = false }: { post: CommunityPost; detail?: boolean }) {
  const navigate = useNavigate();
  const actions = useCommunityActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const a = post.author;
  const isOwn = actions.user?.id === post.user_id;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const requireLogin = (fn: () => void) => () => {
    if (!actions.user) {
      toast("Sign in to interact with the community");
      navigate({ to: "/login" });
      return;
    }
    fn();
  };

  const openDetail = () => {
    if (!detail) navigate({ to: "/community/post/$id", params: { id: post.id } });
  };

  const menuItem =
    "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-foreground";

  return (
    <Card
      className={`relative p-4 sm:p-5 ${detail ? "" : "cursor-pointer transition hover:border-gold/20"}`}
    >
      {post.is_pinned && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-gold/80">
          <Pin className="h-3 w-3" /> Pinned
        </div>
      )}
      <div className="flex gap-3">
        <Link
          to="/u/$username"
          params={{ username: a?.username ?? "" }}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0"
        >
          <UserAvatar avatarUrl={a?.avatar_url} displayName={a?.full_name} size="md" />
        </Link>
        <div className="min-w-0 flex-1" onClick={openDetail}>
          {/* header */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link
              to="/u/$username"
              params={{ username: a?.username ?? "" }}
              onClick={(e) => e.stopPropagation()}
              className="truncate text-sm font-medium hover:underline"
            >
              {a?.full_name ?? "Unknown"}
            </Link>
            {a?.premium_tier && a.premium_tier !== "free" && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-gold" aria-label="Premium" />
            )}
            {a?.title && (
              <span className="rounded bg-gold/15 px-1 text-[10px] text-gold">{a.title}</span>
            )}
            <span className="truncate text-xs text-muted-foreground">@{a?.username}</span>
            <SeasonShield sp={a?.season_points ?? a?.iq_level ?? 0} size="xs" variant="chip" />
            <span className="text-xs text-muted-foreground">· {relTime(post.created_at)}</span>
            {TYPE_LABEL[post.post_type] && (
              <span className="rounded-full border border-emerald/30 bg-emerald/10 px-2 py-px text-[10px] text-emerald">
                {TYPE_LABEL[post.post_type]}
              </span>
            )}
            {!isOwn && actions.user && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.follow.mutate(post.user_id);
                }}
                className={`ml-1 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                  post.is_following_author
                    ? "border-white/15 bg-white/5 text-muted-foreground hover:border-rose-400/40 hover:text-rose-400"
                    : "border-gold/40 text-gold hover:bg-gold/15"
                }`}
              >
                <UserPlus className="h-3 w-3" />
                {post.is_following_author ? "Following" : "Follow"}
              </button>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
            {a && (
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-gold/60" /> {a.community_score} score
              </span>
            )}
            {a?.iq_level != null && <span>IQ {a.iq_level}</span>}
            {a?.country && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {a.country}
              </span>
            )}
          </div>

          {/* body */}
          {post.content && (
            <div className="mt-2">
              <RichText text={post.content} />
            </div>
          )}
          {post.media_url && (
            <img
              src={post.media_url}
              alt=""
              loading="lazy"
              className="mt-3 max-h-[420px] w-auto max-w-full rounded-xl border border-white/10 object-contain"
            />
          )}
          {post.link_url && (
            <a
              href={post.link_url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="mt-3 flex items-center gap-2 truncate rounded-xl border border-white/10 px-3 py-2 text-xs text-gold hover:border-gold/30"
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" /> {post.link_url}
            </a>
          )}
          {post.post_type === "puzzle" && post.fen ? (
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <PuzzleViewer fen={post.fen} solution={post.puzzle_solution} />
            </div>
          ) : post.pgn ? (
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <PgnViewer pgn={post.pgn} />
            </div>
          ) : post.fen ? (
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <FenViewer fen={post.fen} />
            </div>
          ) : null}
          {post.poll_options && post.poll_options.length > 0 && (
            <div onClick={(e) => e.stopPropagation()}>
              <PollBlock post={post} />
            </div>
          )}
          {post.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {post.tags.map((t) => (
                <Link
                  key={t}
                  to="/community/explore"
                  search={{ tag: t, q: undefined }}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-emerald hover:border-emerald/40"
                >
                  #{t}
                </Link>
              ))}
            </div>
          )}

          {/* actions */}
          <div className="-ml-2 mt-3 flex items-center gap-1 sm:gap-3">
            <ActionButton
              icon={Heart}
              count={post.likes_count}
              active={post.my_reaction === "like"}
              activeClass="text-rose-400"
              label="Like"
              onClick={requireLogin(() =>
                actions.reactToPost.mutate({ postId: post.id, reaction: "like" }),
              )}
            />
            <ActionButton
              icon={HeartOff}
              count={post.dislikes_count}
              active={post.my_reaction === "dislike"}
              activeClass="text-sky-400"
              label="Dislike"
              onClick={requireLogin(() =>
                actions.reactToPost.mutate({ postId: post.id, reaction: "dislike" }),
              )}
            />
            <ActionButton
              icon={MessageCircle}
              count={post.comments_count}
              label="Comments"
              onClick={() => navigate({ to: "/community/post/$id", params: { id: post.id } })}
            />
            <ActionButton
              icon={Share2}
              count={post.shares_count}
              label="Share"
              onClick={() => actions.share.mutate(post.id)}
            />
            <ActionButton
              icon={Bookmark}
              count={post.bookmarks_count}
              active={post.is_bookmarked}
              label="Bookmark"
              onClick={requireLogin(() => actions.bookmark.mutate({ postId: post.id }))}
            />
          </div>
        </div>

        {/* overflow menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            aria-label="Post menu"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-9 z-20 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#101317] py-1 shadow-luxe"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={menuItem}
                onClick={() => {
                  actions.share.mutate(post.id);
                  setMenuOpen(false);
                }}
              >
                <Link2 className="h-3.5 w-3.5" /> Copy link
              </button>
              <button
                type="button"
                className={menuItem}
                onClick={requireLogin(() => {
                  actions.bookmark.mutate({ postId: post.id });
                  setMenuOpen(false);
                })}
              >
                <Bookmark className="h-3.5 w-3.5" />
                {post.is_bookmarked ? "Remove bookmark" : "Bookmark"}
              </button>
              {!isOwn && (
                <>
                  <button
                    type="button"
                    className={menuItem}
                    onClick={requireLogin(() => {
                      actions.follow.mutate(post.user_id);
                      setMenuOpen(false);
                    })}
                  >
                    {post.is_following_author ? (
                      <>
                        <UserMinus className="h-3.5 w-3.5" /> Unfollow @{a?.username}
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-3.5 w-3.5" /> Follow @{a?.username}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className={menuItem}
                    onClick={requireLogin(() => {
                      actions.mute.mutate({ targetId: post.user_id, muted: false });
                      setMenuOpen(false);
                    })}
                  >
                    <VolumeX className="h-3.5 w-3.5" /> Mute @{a?.username}
                  </button>
                  <button
                    type="button"
                    className={menuItem}
                    onClick={requireLogin(() => {
                      actions.hidePost.mutate(post.id);
                      setMenuOpen(false);
                    })}
                  >
                    <EyeOff className="h-3.5 w-3.5" /> Hide this post
                  </button>
                  <button
                    type="button"
                    className={`${menuItem} text-rose-400`}
                    onClick={requireLogin(() => {
                      setReporting(true);
                      setMenuOpen(false);
                    })}
                  >
                    <Flag className="h-3.5 w-3.5" /> Report
                  </button>
                </>
              )}
              {isOwn && (
                <button
                  type="button"
                  className={`${menuItem} text-rose-400`}
                  onClick={() => {
                    if (window.confirm("Delete this post permanently?"))
                      actions.removePost.mutate(post.id);
                    setMenuOpen(false);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete post
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {reporting && (
        <ReportDialog
          onClose={() => setReporting(false)}
          onSubmit={(reason, details) => {
            actions.report.mutate({ targetType: "post", targetId: post.id, reason, details });
            setReporting(false);
          }}
        />
      )}
    </Card>
  );
}

export function ReportDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (reason: ReportReason, details?: string) => void;
}) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101317] p-5 shadow-luxe"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium">Report content</h3>
        <div className="mt-3 space-y-1.5">
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="radio"
                name="report-reason"
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="accent-[#D4AF37]"
              />
              {r.label}
            </label>
          ))}
        </div>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Additional details (optional)"
          rows={2}
          className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs outline-none focus:border-gold/40"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(reason, details.trim() || undefined)}
            className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/30"
          >
            Submit report
          </button>
        </div>
      </div>
    </div>
  );
}
