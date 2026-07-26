import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { Inbox, Swords, UserCheck, UserX, Wifi, WifiOff, Loader2, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useFriends } from "@/hooks/useFriends";
import { useChallenges } from "@/hooks/useChallenges";
import { useClanInvites } from "@/hooks/useClanInvites";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserAvatar } from "@/components/site/UserAvatar";
import { EmptyState } from "@/components/friends/EmptyState";
import { ClanInviteCard } from "@/components/friends/ClanInviteCard";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/friends/activity")({
  head: () =>
    noindexSeo(
      "Friend Activity — ChessOx",
      "See what your chess friends are playing and achieving on ChessOx.",
    ),
  component: FriendActivityPage,
});

type FeedNotif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
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

  const [feed, setFeed] = useState<FeedNotif[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [presenceEvents, setPresenceEvents] = useState<PresenceEvent[]>([]);
  const navigate = useNavigate();

  const incomingRequests = friends.filter(
    (f) => f.status === "pending" && f.addressee_id === user?.id,
  );
  const acceptedFriends = friends.filter((f) => f.status === "accepted");

  // Historical feed: friend_accept / friend_removed events (friend_request &
  // challenge are shown live with action buttons above instead, to avoid
  // duplicating already-actionable items).
  useEffect(() => {
    if (!user) return;
    setFeedLoading(true);
    supabase
      .from("notifications")
      .select("id,kind,title,body,created_at")
      .eq("user_id", user.id)
      .in("kind", ["friend_accept", "friend_removed"])
      .order("created_at", { ascending: false })
      .limit(30)
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
          if (n.kind === "friend_accept" || n.kind === "friend_removed") {
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

  const isEmpty =
    incomingRequests.length === 0 &&
    incomingChallenges.length === 0 &&
    clanInvites.length === 0 &&
    acceptedFriends.length === 0 &&
    presenceEvents.length === 0 &&
    feed.length === 0;

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
    >
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
          <Section title="Recent Friend Requests" show={incomingRequests.length > 0}>
            {incomingRequests.map((r) => (
              <ActivityRow
                key={r.id}
                avatarUrl={r.other_avatar_url}
                name={r.other_display ?? r.other_username ?? "Someone"}
                text={`${r.other_display ?? r.other_username ?? "Someone"} sent you a friend request`}
                time={relTime(r.created_at)}
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

          <Section title="Challenge Invitations" show={incomingChallenges.length > 0}>
            {incomingChallenges.map((c) => (
              <ActivityRow
                key={c.id}
                avatarUrl={c.other_avatar_url}
                name={c.other_display ?? c.other_username ?? "Someone"}
                text={`${c.other_display ?? c.other_username ?? "Someone"} challenged you`}
                sub={`${c.time_control} · ${c.is_rated ? "Rated" : "Casual"}`}
                time={relTime(c.created_at)}
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

          <Section title="Clan Invites" show={clanInvites.length > 0}>
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

          <Section title="Accepted Friends" show={acceptedFriends.length > 0}>
            {acceptedFriends.slice(0, 8).map((f) => (
              <ActivityRow
                key={f.id}
                avatarUrl={f.other_avatar_url}
                name={f.other_display ?? f.other_username ?? "Someone"}
                text={`You and ${f.other_display ?? f.other_username ?? "your friend"} are now friends`}
                time={relTime(f.created_at)}
                icon={<UserCheck className="h-4 w-4" />}
              />
            ))}
          </Section>

          <Section title="Friend Online" show={presenceEvents.some((e) => e.online)}>
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

          <Section title="Friend Offline" show={presenceEvents.some((e) => !e.online)}>
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

          <Section title="Removed Friends" show={feed.some((n) => n.kind === "friend_removed")}>
            {feed
              .filter((n) => n.kind === "friend_removed")
              .map((n) => (
                <ActivityRow
                  key={n.id}
                  name=""
                  text={n.body ?? n.title}
                  time={relTime(n.created_at)}
                  icon={<UserX className="h-4 w-4" />}
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
  show,
  children,
}: {
  title: string;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <div>
      <div className="mb-3 font-display text-xl">{title}</div>
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
}: {
  avatarUrl?: string | null;
  name: string;
  text: string;
  sub?: string;
  time: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="flex items-center gap-3 p-4 animate-in fade-in slide-in-from-bottom-1 duration-300">
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
      <div className="shrink-0 text-xs text-muted-foreground">{time}</div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </Card>
  );
}
