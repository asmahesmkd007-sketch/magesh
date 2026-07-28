import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import {
  Inbox,
  Swords,
  UserCheck,
  UserX,
  Wifi,
  WifiOff,
  Loader2,
  Check,
  X,
  CheckCheck,
  Shield,
  Pin,
  Star,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useFriends } from "@/hooks/useFriends";
import { useChallenges } from "@/hooks/useChallenges";
import { useClanInvites } from "@/hooks/useClanInvites";
import { usePinnedFriends, useFavoriteFriends } from "@/hooks/useFriendPreferences";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserAvatar } from "@/components/site/UserAvatar";
import { EmptyState } from "@/components/friends/EmptyState";
import { ClanInviteCard } from "@/components/friends/ClanInviteCard";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/friends_/activity")({
  head: () =>
    noindexSeo(
      "Friend Activity — ChessOx",
      "See what your chess friends are playing and achieving on ChessOx.",
    ),
  component: FriendActivityPage,
});

type FilterKey = "all" | "friends" | "challenges" | "requests" | "clan";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "friends", label: "Friends" },
  { key: "challenges", label: "Challenges" },
  { key: "requests", label: "Requests" },
  { key: "clan", label: "Clan" },
];

type FeedNotif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read: boolean;
};

type PresenceEvent = { id: string; friendId: string; name: string; online: boolean; at: number };

function relTime(iso: string | number) {
  const diff = Date.now() - (typeof iso === "number" ? iso : new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function FriendActivityPage() {
  const { user } = useAuth();
  const { friends, acceptRequest, declineRequest } = useFriends(user?.id);
  const { incoming: incomingChallenges, respond: respondChallenge } = useChallenges(user?.id);
  const { invites: clanInvites, respond: respondClanInvite } = useClanInvites(user?.id);
  const { ids: pinnedIds } = usePinnedFriends(user?.id);
  const { ids: favoriteIds } = useFavoriteFriends(user?.id);

  const [feed, setFeed] = useState<FeedNotif[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [presenceEvents, setPresenceEvents] = useState<PresenceEvent[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const navigate = useNavigate();

  const incomingRequests = friends.filter(
    (f) => f.status === "pending" && f.addressee_id === user?.id,
  );
  const acceptedFriends = friends.filter((f) => f.status === "accepted");
  const pinnedFriends = acceptedFriends.filter((f) => pinnedIds.has(f.other_id));
  const favoriteFriends = acceptedFriends.filter((f) => favoriteIds.has(f.other_id));

  // Historical feed: friend_accept / friend_removed / resolved-challenge
  // events. New friend requests & incoming challenges are shown live with
  // action buttons above instead, to avoid duplicating already-actionable
  // items.
  useEffect(() => {
    if (!user) return;
    setFeedLoading(true);
    supabase
      .from("notifications")
      .select("id,kind,title,body,link,created_at,read")
      .eq("user_id", user.id)
      .in("kind", ["friend_accept", "friend_removed", "challenge", "challenge_cancelled"])
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data }) => {
        setFeed((data ?? []) as FeedNotif[]);
        setFeedLoading(false);
      });

    const ch = supabase
      .channel(`friend-activity:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (p) => {
          const n = p.new as FeedNotif;
          if (
            ["friend_accept", "friend_removed", "challenge", "challenge_cancelled"].includes(n.kind)
          ) {
            setFeed((prev) => [n, ...prev]);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  // Session-only online/offline presence transitions for accepted friends.
  useEffect(() => {
    if (!user || acceptedFriends.length === 0) return;
    const nameById = new Map(
      acceptedFriends.map((f) => [f.other_id, f.other_display ?? f.other_username ?? "A friend"]),
    );
    const onlineById = new Map(acceptedFriends.map((f) => [f.other_id, !!f.other_is_online]));

    const ch = supabase
      .channel(`friend-presence:${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (p) => {
        const row = p.new as { id: string; is_online: boolean };
        if (!nameById.has(row.id)) return;
        const prevOnline = onlineById.get(row.id);
        if (prevOnline === row.is_online) return;
        onlineById.set(row.id, row.is_online);
        setPresenceEvents((prev) =>
          [
            {
              id: `${row.id}:${Date.now()}`,
              friendId: row.id,
              name: nameById.get(row.id)!,
              online: row.is_online,
              at: Date.now(),
            },
            ...prev,
          ].slice(0, 20),
        );
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, acceptedFriends.map((f) => f.other_id).join(",")]);

  async function markFeedRead(id: string) {
    setFeed((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }

  async function markAllFeedRead() {
    if (!user) return;
    const unreadIds = feed.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setFeed((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    toast.success("All caught up");
  }

  const unreadFeedCount = useMemo(() => feed.filter((n) => !n.read).length, [feed]);
  const totalUnread =
    incomingRequests.length + incomingChallenges.length + clanInvites.length + unreadFeedCount;

  const resolvedChallengeFeed = feed.filter(
    (n) => n.kind === "challenge" && n.title !== "New challenge",
  );
  const cancelledChallengeFeed = feed.filter((n) => n.kind === "challenge_cancelled");
  const removedFriendFeed = feed.filter((n) => n.kind === "friend_removed");
  const acceptedFriendFeed = feed.filter((n) => n.kind === "friend_accept");

  const show = {
    requests: filter === "all" || filter === "requests",
    challenges: filter === "all" || filter === "challenges",
    clan: filter === "all" || filter === "clan",
    friends: filter === "all" || filter === "friends",
  };

  const isEmpty =
    incomingRequests.length === 0 &&
    incomingChallenges.length === 0 &&
    clanInvites.length === 0 &&
    acceptedFriendFeed.length === 0 &&
    presenceEvents.length === 0 &&
    resolvedChallengeFeed.length === 0 &&
    cancelledChallengeFeed.length === 0 &&
    removedFriendFeed.length === 0 &&
    pinnedFriends.length === 0 &&
    favoriteFriends.length === 0;

  if (!user) {
    return (
      <PageShell eyebrow="Inbox" title="Friend Activity">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Sign in to view your friend activity.</p>
          <div className="mt-4">
            <Link to="/auth">
              <GoldButton>Sign in</GoldButton>
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Inbox"
      title="Friend Activity"
      subtitle="Everything friend-related, in one place — live."
      action={
        unreadFeedCount > 0 ? (
          <button
            onClick={markAllFeedRead}
            className="flex items-center gap-2 rounded-full border border-gold/30 px-4 py-2 text-sm text-gold transition-colors hover:bg-gold/10"
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        ) : undefined
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              filter === f.key
                ? "border-gold bg-gold/10 text-gold"
                : "border-white/10 text-muted-foreground hover:border-gold/30"
            }`}
          >
            {f.label}
          </button>
        ))}
        {!feedLoading && !isEmpty && (
          <span className="royal-chip ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-muted-foreground">
            <span
              className={`h-1.5 w-1.5 rounded-full ${totalUnread > 0 ? "animate-pulse-dot bg-gold" : "bg-emerald"}`}
            />
            {totalUnread > 0
              ? `${totalUnread} need${totalUnread === 1 ? "s" : ""} your attention`
              : "All caught up"}
          </span>
        )}
      </div>

      {feedLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={Inbox}
          title="No Activity"
          subtitle="Friend requests, challenges, and clan invites will show up here as they happen."
        />
      ) : (
        <div className="space-y-8">
          <Section
            title="Recent Friend Requests"
            icon={UserCheck}
            tone="gold"
            show={show.requests && incomingRequests.length > 0}
            count={incomingRequests.length}
          >
            {incomingRequests.map((r) => (
              <ActivityRow
                key={r.id}
                avatarUrl={r.other_avatar_url}
                name={r.other_display ?? r.other_username ?? "Someone"}
                text={`${r.other_display ?? r.other_username ?? "Someone"} sent you a friend request`}
                time={relTime(r.created_at)}
                unread
                actions={
                  <>
                    <GoldButton
                      onClick={() => {
                        acceptRequest(r.id);
                        toast.success("Friend accepted!");
                      }}
                    >
                      <Check className="h-4 w-4" /> Accept
                    </GoldButton>
                    <GhostButton onClick={() => declineRequest(r.id)}>
                      <X className="h-4 w-4" /> Reject
                    </GhostButton>
                  </>
                }
              />
            ))}
          </Section>

          <Section
            title="Challenge Invitations"
            icon={Swords}
            tone="gold"
            show={show.challenges && incomingChallenges.length > 0}
            count={incomingChallenges.length}
          >
            {incomingChallenges.map((c) => (
              <ActivityRow
                key={c.id}
                avatarUrl={c.other_avatar_url}
                name={c.other_display ?? c.other_username ?? "Someone"}
                text={`${c.other_display ?? c.other_username ?? "Someone"} challenged you`}
                sub={`${c.time_control} · ${c.is_rated ? "Rated" : "Casual"}`}
                time={relTime(c.created_at)}
                unread
                actions={
                  <>
                    <GoldButton
                      onClick={async () => {
                        const gameId = await respondChallenge(c.id, true);
                        if (gameId) navigate({ to: "/game/$id", params: { id: gameId } });
                      }}
                    >
                      <Swords className="h-4 w-4" /> Join Game
                    </GoldButton>
                    <GhostButton onClick={() => respondChallenge(c.id, false)}>Decline</GhostButton>
                  </>
                }
              />
            ))}
          </Section>

          <Section
            title="Challenge Accepted / Declined"
            icon={Swords}
            tone="emerald"
            show={show.challenges && resolvedChallengeFeed.length > 0}
          >
            {resolvedChallengeFeed.map((n) => {
              const gameId =
                n.title === "Challenge accepted" ? n.link?.match(/^\/game\/(.+)$/)?.[1] : undefined;
              return (
                <ActivityRow
                  key={n.id}
                  name=""
                  text={n.body ?? n.title}
                  time={relTime(n.created_at)}
                  icon={<Swords className="h-4 w-4" />}
                  unread={!n.read}
                  onClick={() => !n.read && markFeedRead(n.id)}
                  actions={
                    gameId ? (
                      <GoldButton
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate({ to: "/game/$id", params: { id: gameId } });
                        }}
                      >
                        <Swords className="h-4 w-4" /> Join Game
                      </GoldButton>
                    ) : undefined
                  }
                />
              );
            })}
          </Section>

          <Section
            title="Challenge Cancelled"
            icon={X}
            tone="muted"
            show={show.challenges && cancelledChallengeFeed.length > 0}
          >
            {cancelledChallengeFeed.map((n) => (
              <ActivityRow
                key={n.id}
                name=""
                text={n.body ?? n.title}
                time={relTime(n.created_at)}
                icon={<X className="h-4 w-4" />}
                unread={!n.read}
                onClick={() => !n.read && markFeedRead(n.id)}
              />
            ))}
          </Section>

          <Section
            title="Clan Invites"
            icon={Shield}
            tone="gold"
            show={show.clan && clanInvites.length > 0}
            count={clanInvites.length}
          >
            {clanInvites.map((inv) => (
              <ClanInviteCard
                key={inv.id}
                invite={inv}
                onRespond={async (id, accept) => {
                  try {
                    await respondClanInvite(id, accept);
                    toast.success(
                      accept ? `Joined ${inv.clan_name ?? "the clan"}!` : "Invite rejected",
                    );
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to respond");
                  }
                }}
              />
            ))}
          </Section>

          <Section
            title="Accepted Friends"
            icon={UserCheck}
            tone="emerald"
            show={show.friends && acceptedFriendFeed.length > 0}
          >
            {acceptedFriendFeed.slice(0, 8).map((n) => (
              <ActivityRow
                key={n.id}
                name=""
                text={n.body ?? n.title}
                time={relTime(n.created_at)}
                icon={<UserCheck className="h-4 w-4" />}
                unread={!n.read}
                onClick={() => !n.read && markFeedRead(n.id)}
              />
            ))}
          </Section>

          <Section
            title="Friend Online"
            icon={Wifi}
            tone="emerald"
            show={show.friends && presenceEvents.some((e) => e.online)}
          >
            {presenceEvents
              .filter((e) => e.online)
              .map((e) => (
                <ActivityRow
                  key={e.id}
                  name={e.name}
                  text={`${e.name} came online`}
                  time={relTime(e.at)}
                  icon={<Wifi className="h-4 w-4 text-emerald" />}
                />
              ))}
          </Section>

          <Section
            title="Friend Offline"
            icon={WifiOff}
            tone="muted"
            show={show.friends && presenceEvents.some((e) => !e.online)}
          >
            {presenceEvents
              .filter((e) => !e.online)
              .map((e) => (
                <ActivityRow
                  key={e.id}
                  name={e.name}
                  text={`${e.name} went offline`}
                  time={relTime(e.at)}
                  icon={<WifiOff className="h-4 w-4 text-muted-foreground" />}
                />
              ))}
          </Section>

          <Section
            title="Pinned Friends"
            icon={Pin}
            tone="gold"
            show={show.friends && pinnedFriends.length > 0}
            count={pinnedFriends.length}
          >
            {pinnedFriends.map((f) => (
              <ActivityRow
                key={f.id}
                avatarUrl={f.other_avatar_url}
                name={f.other_display ?? f.other_username ?? "Someone"}
                text={`${f.other_display ?? f.other_username ?? "Someone"} is pinned to the top of your friends list`}
                time=""
                icon={<Pin className="h-4 w-4 text-gold" fill="currentColor" />}
              />
            ))}
          </Section>

          <Section
            title="Favorite Friends"
            icon={Star}
            tone="gold"
            show={show.friends && favoriteFriends.length > 0}
            count={favoriteFriends.length}
          >
            {favoriteFriends.map((f) => (
              <ActivityRow
                key={f.id}
                avatarUrl={f.other_avatar_url}
                name={f.other_display ?? f.other_username ?? "Someone"}
                text={`${f.other_display ?? f.other_username ?? "Someone"} is one of your favorites`}
                time=""
                icon={<Star className="h-4 w-4 text-gold" fill="currentColor" />}
              />
            ))}
          </Section>

          <Section
            title="Removed Friends"
            icon={UserX}
            tone="muted"
            show={show.friends && removedFriendFeed.length > 0}
          >
            {removedFriendFeed.map((n) => (
              <ActivityRow
                key={n.id}
                name=""
                text={n.body ?? n.title}
                time={relTime(n.created_at)}
                icon={<UserX className="h-4 w-4" />}
                unread={!n.read}
                onClick={() => !n.read && markFeedRead(n.id)}
              />
            ))}
          </Section>
        </div>
      )}
    </PageShell>
  );
}

function Section({
  title,
  icon: Icon,
  tone = "gold",
  show,
  count,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "gold" | "emerald" | "muted";
  show: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  if (!show) return null;
  const toneClass =
    tone === "gold"
      ? "bg-gold/10 text-gold"
      : tone === "emerald"
        ? "bg-emerald/10 text-emerald"
        : "bg-white/5 text-muted-foreground";
  return (
    <div className="animate-rise-in">
      <div className="mb-3 flex items-center gap-2">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${toneClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="font-display text-xl">{title}</div>
        {!!count && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold/20 px-1.5 text-[10px] font-semibold text-gold">
            {count}
          </span>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ActivityRow({
  avatarUrl,
  name,
  text,
  sub,
  time,
  actions,
  icon,
  unread,
  onClick,
}: {
  avatarUrl?: string | null;
  name: string;
  text: string;
  sub?: string;
  time: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  unread?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-label={onClick ? `${text}. Mark as read.` : undefined}
      className={`surface-card animate-rise-in flex items-center gap-3 rounded-[22px] p-4 transition-colors duration-200 ${
        unread ? "border-gold/25 bg-gold/[0.025]" : ""
      } ${onClick ? "cursor-pointer hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold" : ""}`}
    >
      {icon ? (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5">
          {icon}
        </span>
      ) : (
        <UserAvatar avatarUrl={avatarUrl} displayName={name} size="sm" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm">{text}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      {time && <div className="shrink-0 text-xs text-muted-foreground">{time}</div>}
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      {unread && !actions && <div className="h-2 w-2 shrink-0 rounded-full bg-gold" />}
    </div>
  );
}
