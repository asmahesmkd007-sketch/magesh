import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { useEffect, useState } from "react";
import {
  Bell,
  CheckCheck,
  Loader2,
  Trophy,
  UserPlus,
  Users,
  Flame,
  Swords,
  Info,
  Heart,
  MessageCircle,
  AtSign,
  Mail,
  Check,
  X,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGameSettings } from "@/hooks/useGameSettings";
import { isNotificationKindEnabled } from "@/lib/notificationCategories";
import { useFriends } from "@/hooks/useFriends";
import { useChallenges } from "@/hooks/useChallenges";
import { useClanInvites } from "@/hooks/useClanInvites";
import { toast } from "sonner";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/notifications")({
  head: () =>
    noindexSeo(
      "Notifications — ChessOx",
      "Your ChessOx notifications: challenges, friend requests, tournament updates and community activity.",
      "noindex, nofollow",
    ),
  component: Notifs,
});

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function kindIcon(kind: string) {
  switch (kind) {
    case "tournament":
    case "achievement":
      return Trophy;
    case "friend_request":
    case "follow":
      return UserPlus;
    case "like":
      return Heart;
    case "comment":
    case "reply":
      return MessageCircle;
    case "mention":
    case "chat_mention":
      return AtSign;
    case "dm":
      return Mail;
    case "room_invite":
      return UserPlus;
    case "club":
      return Users;
    case "puzzle":
    case "streak":
      return Flame;
    case "challenge":
      return Swords;
    default:
      return Info;
  }
}

function Notifs() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { settings } = useGameSettings();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [actionedIds, setActionedIds] = useState<Record<string, "accepted" | "declined">>({});

  // Hooks for handling requests
  const { friends, acceptRequest, declineRequest } = useFriends(user?.id);
  const { incoming: incomingChallenges, respond: respondChallenge } = useChallenges(user?.id);
  const { invites: clanInvites, respond: respondClanInvite } = useClanInvites(user?.id);

  const pendingFriendRequests = friends.filter(
    (f) => f.status === "pending" && f.addressee_id === user?.id,
  );

  const prefs = {
    notify_tournament_starting: settings.notify_tournament_starting,
    notify_challenge_received: settings.notify_challenge_received,
    notify_community: settings.notify_community,
  };
  const visibleNotifs = notifs.filter((n) => isNotificationKindEnabled(n.kind, prefs));

  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => {
        setNotifs((data ?? []) as Notif[]);
        setLoading(false);
      });
  }, [user, authLoading]);

  // Realtime subscription to keep notifications page list state updated
  useEffect(() => {
    if (!user) return;
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const topic = `notifs_page:${user.id}`;
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const ch = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (p) => {
          const n = p.new as Notif;
          setNotifs((prev) => [n, ...prev]);
        },
      );
    ch.subscribe();
    activeChannel = ch;

    return () => {
      cancelled = true;
      if (activeChannel) {
        supabase.removeChannel(activeChannel);
      }
    };
  }, [user]);

  async function markRead(id: string) {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase.from("notifications").update({ read: true } as never).eq("id", id);
  }

  async function markAllRead() {
    if (!user) return;
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase
      .from("notifications")
      .update({ read: true } as never)
      .eq("user_id", user.id)
      .eq("read", false);
    toast.success("All marked as read");
  }

  // Handle Accept / Decline for Friend Requests
  const handleFriendRequest = async (notifId: string, friendRowId: string, accept: boolean) => {
    setBusyActionId(notifId);
    try {
      if (accept) {
        await acceptRequest(friendRowId);
        toast.success("Friend request accepted!");
        setActionedIds((prev) => ({ ...prev, [notifId]: "accepted" }));
      } else {
        await declineRequest(friendRowId);
        toast.success("Friend request declined");
        setActionedIds((prev) => ({ ...prev, [notifId]: "declined" }));
      }
      await markRead(notifId);
    } catch {
      toast.error("Failed to process friend request");
    } finally {
      setBusyActionId(null);
    }
  };

  // Handle Accept / Decline for Game Challenges
  const handleChallengeRequest = async (notifId: string, challengeId: string, accept: boolean) => {
    setBusyActionId(notifId);
    try {
      if (accept) {
        const gameId = await respondChallenge(challengeId, true);
        toast.success("Challenge accepted! Entering game...");
        setActionedIds((prev) => ({ ...prev, [notifId]: "accepted" }));
        await markRead(notifId);
        if (gameId) {
          navigate({ to: "/game/$id", params: { id: gameId } });
        }
      } else {
        await respondChallenge(challengeId, false);
        toast.success("Challenge declined");
        setActionedIds((prev) => ({ ...prev, [notifId]: "declined" }));
        await markRead(notifId);
      }
    } catch {
      toast.error("Failed to process challenge");
    } finally {
      setBusyActionId(null);
    }
  };

  // Handle Accept / Decline for Clan Invites
  const handleClanInviteRequest = async (notifId: string, inviteId: string, accept: boolean) => {
    setBusyActionId(notifId);
    try {
      if (accept) {
        await respondClanInvite(inviteId, true);
        toast.success("Clan invite accepted!");
        setActionedIds((prev) => ({ ...prev, [notifId]: "accepted" }));
      } else {
        await respondClanInvite(inviteId, false);
        toast.success("Clan invite declined");
        setActionedIds((prev) => ({ ...prev, [notifId]: "declined" }));
      }
      await markRead(notifId);
    } catch {
      toast.error("Failed to process clan invite");
    } finally {
      setBusyActionId(null);
    }
  };

  const unreadCount = visibleNotifs.filter((n) => !n.read).length;

  if (!authLoading && !user) {
    return (
      <PageShell eyebrow="Inbox" title="Notifications">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Sign in to view your notifications.</p>
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
      title="Notifications"
      action={
        unreadCount > 0 ? (
          <button
            onClick={markAllRead}
            className="flex items-center gap-2 rounded-full border border-gold/30 px-4 py-2 text-sm text-gold hover:bg-gold/10 transition"
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        ) : undefined
      }
    >
      {loading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : visibleNotifs.length === 0 ? (
        <Card className="p-10 text-center">
          <Bell className="mx-auto h-10 w-10 text-gold/30" />
          <p className="mt-4 text-muted-foreground">
            No notifications yet. Play games and join clubs to get updates!
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Action Required Banner for active pending requests */}
          {(pendingFriendRequests.length > 0 || incomingChallenges.length > 0 || clanInvites.length > 0) && (
            <Card className="p-4 border-gold/30 bg-gold/[0.04]">
              <div className="flex items-center gap-2 text-sm font-semibold text-gold mb-3">
                <ShieldAlert className="h-4 w-4" /> Pending Action Requests
              </div>

              {/* Pending Friend Requests */}
              {pendingFriendRequests.map((fr) => (
                <div
                  key={fr.id}
                  className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-none"
                >
                  <div className="flex items-center gap-3">
                    <UserPlus className="h-4 w-4 text-gold shrink-0" />
                    <span className="text-sm font-medium">
                      {fr.other_display ?? fr.other_username ?? "Someone"} sent you a friend request
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleFriendRequest("fr-" + fr.id, fr.id, true)}
                      disabled={busyActionId === "fr-" + fr.id}
                      className="flex items-center gap-1 rounded-full gradient-gold px-3.5 py-1 text-xs font-semibold text-[#0B0D10] hover:opacity-90 disabled:opacity-50"
                    >
                      {busyActionId === "fr-" + fr.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Accept
                    </button>
                    <button
                      onClick={() => handleFriendRequest("fr-" + fr.id, fr.id, false)}
                      disabled={busyActionId === "fr-" + fr.id}
                      className="flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-white disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                      Decline
                    </button>
                  </div>
                </div>
              ))}

              {/* Pending Game Challenges */}
              {incomingChallenges.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-none"
                >
                  <div className="flex items-center gap-3">
                    <Swords className="h-4 w-4 text-gold shrink-0" />
                    <span className="text-sm font-medium">
                      {ch.other_display ?? ch.other_username ?? "Someone"} challenged you (
                      {ch.time_control ?? "Casual"})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleChallengeRequest("ch-" + ch.id, ch.id, true)}
                      disabled={busyActionId === "ch-" + ch.id}
                      className="flex items-center gap-1 rounded-full gradient-gold px-3.5 py-1 text-xs font-semibold text-[#0B0D10] hover:opacity-90 disabled:opacity-50"
                    >
                      {busyActionId === "ch-" + ch.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Accept
                    </button>
                    <button
                      onClick={() => handleChallengeRequest("ch-" + ch.id, ch.id, false)}
                      disabled={busyActionId === "ch-" + ch.id}
                      className="flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-white disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                      Decline
                    </button>
                  </div>
                </div>
              ))}

              {/* Pending Clan Invites */}
              {clanInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-none"
                >
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-gold shrink-0" />
                    <span className="text-sm font-medium">
                      Invited to join clan {inv.clan_name ?? "Clan"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleClanInviteRequest("cl-" + inv.id, inv.id, true)}
                      disabled={busyActionId === "cl-" + inv.id}
                      className="flex items-center gap-1 rounded-full gradient-gold px-3.5 py-1 text-xs font-semibold text-[#0B0D10] hover:opacity-90 disabled:opacity-50"
                    >
                      {busyActionId === "cl-" + inv.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Accept
                    </button>
                    <button
                      onClick={() => handleClanInviteRequest("cl-" + inv.id, inv.id, false)}
                      disabled={busyActionId === "cl-" + inv.id}
                      className="flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-white disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </Card>
          )}

          <div className="space-y-2">
            {visibleNotifs.map((n) => {
              const Icon = kindIcon(n.kind);
              const actionState = actionedIds[n.id];

              // Find matching pending requests for embedded card actions
              const matchingFR =
                n.kind === "friend_request"
                  ? pendingFriendRequests.find(
                      (r) =>
                        (r.other_username &&
                          (n.body?.includes(r.other_username) || n.title.includes(r.other_username))) ||
                        (r.other_display &&
                          (n.body?.includes(r.other_display) || n.title.includes(r.other_display))),
                    ) ?? pendingFriendRequests[0]
                  : null;

              const matchingCH =
                n.kind === "challenge"
                  ? incomingChallenges.find(
                      (c) =>
                        (c.other_username &&
                          (n.body?.includes(c.other_username) || n.title.includes(c.other_username))) ||
                        (c.other_display &&
                          (n.body?.includes(c.other_display) || n.title.includes(c.other_display))),
                    ) ?? incomingChallenges[0]
                  : null;

              const matchingCL =
                n.kind === "room_invite" || n.kind === "club"
                  ? clanInvites.find(
                      (i) =>
                        (i.clan_name &&
                          (n.body?.includes(i.clan_name) || n.title.includes(i.clan_name))) ||
                        (i.clan_tag &&
                          (n.body?.includes(i.clan_tag) || n.title.includes(i.clan_tag))),
                    ) ?? clanInvites[0]
                  : null;

              const cardContent = (
                <div
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border p-4 transition ${!n.read ? "border-gold/20 bg-gold/[0.03]" : "border-white/5 bg-white/[0.01]"}`}
                >
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <span
                      className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full ${!n.read ? "gradient-gold text-[#0B0D10]" : "bg-white/5 text-muted-foreground"}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm ${!n.read ? "font-semibold text-white" : "text-muted-foreground"}`}>
                        {n.title}
                      </div>
                      {n.body && <div className="mt-0.5 text-xs text-muted-foreground/90">{n.body}</div>}

                      {/* Embedded Action Buttons for Friend Requests */}
                      {n.kind === "friend_request" && (
                        <div className="mt-3 flex items-center gap-2">
                          {actionState === "accepted" ? (
                            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                              <Check className="h-3.5 w-3.5" /> Request Accepted
                            </span>
                          ) : actionState === "declined" ? (
                            <span className="text-xs font-medium text-muted-foreground">Request Declined</span>
                          ) : matchingFR ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleFriendRequest(n.id, matchingFR.id, true);
                                }}
                                disabled={busyActionId === n.id}
                                className="flex items-center gap-1 rounded-full gradient-gold px-3.5 py-1 text-xs font-semibold text-[#0B0D10] hover:opacity-90 disabled:opacity-50"
                              >
                                {busyActionId === n.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleFriendRequest(n.id, matchingFR.id, false);
                                }}
                                disabled={busyActionId === n.id}
                                className="flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-white disabled:opacity-50"
                              >
                                <X className="h-3 w-3" />
                                Decline
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground/70">Processed</span>
                          )}
                        </div>
                      )}

                      {/* Embedded Action Buttons for Challenges */}
                      {n.kind === "challenge" && (
                        <div className="mt-3 flex items-center gap-2">
                          {actionState === "accepted" ? (
                            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                              <Check className="h-3.5 w-3.5" /> Challenge Accepted
                            </span>
                          ) : actionState === "declined" ? (
                            <span className="text-xs font-medium text-muted-foreground">Challenge Declined</span>
                          ) : matchingCH ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleChallengeRequest(n.id, matchingCH.id, true);
                                }}
                                disabled={busyActionId === n.id}
                                className="flex items-center gap-1 rounded-full gradient-gold px-3.5 py-1 text-xs font-semibold text-[#0B0D10] hover:opacity-90 disabled:opacity-50"
                              >
                                {busyActionId === n.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                Accept Challenge
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleChallengeRequest(n.id, matchingCH.id, false);
                                }}
                                disabled={busyActionId === n.id}
                                className="flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-white disabled:opacity-50"
                              >
                                <X className="h-3 w-3" />
                                Decline
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground/70">Completed</span>
                          )}
                        </div>
                      )}

                      {/* Embedded Action Buttons for Clan / Room Invites */}
                      {(n.kind === "room_invite" || n.kind === "club") && (
                        <div className="mt-3 flex items-center gap-2">
                          {actionState === "accepted" ? (
                            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                              <Check className="h-3.5 w-3.5" /> Invite Accepted
                            </span>
                          ) : actionState === "declined" ? (
                            <span className="text-xs font-medium text-muted-foreground">Invite Declined</span>
                          ) : matchingCL ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleClanInviteRequest(n.id, matchingCL.id, true);
                                }}
                                disabled={busyActionId === n.id}
                                className="flex items-center gap-1 rounded-full gradient-gold px-3.5 py-1 text-xs font-semibold text-[#0B0D10] hover:opacity-90 disabled:opacity-50"
                              >
                                {busyActionId === n.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                Accept Invite
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleClanInviteRequest(n.id, matchingCL.id, false);
                                }}
                                disabled={busyActionId === n.id}
                                className="flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-white disabled:opacity-50"
                              >
                                <X className="h-3 w-3" />
                                Decline
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground/70">Processed</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-xs text-muted-foreground">{relTime(n.created_at)}</div>
                    {!n.read && <div className="h-2 w-2 shrink-0 rounded-full bg-gold" />}
                  </div>
                </div>
              );

              return n.link && !["friend_request", "challenge", "room_invite", "club"].includes(n.kind) ? (
                <Link key={n.id} to={n.link as never}>
                  {cardContent}
                </Link>
              ) : (
                <div key={n.id}>{cardContent}</div>
              );
            })}
          </div>
        </div>
      )}
    </PageShell>
  );
}

