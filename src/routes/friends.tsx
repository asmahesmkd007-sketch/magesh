import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import {
  Users,
  Inbox,
  Swords,
  Shield,
  UserPlus,
  Loader2,
  Activity,
  Wifi,
  Bell,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useFriends } from "@/hooks/useFriends";
import { useChallenges } from "@/hooks/useChallenges";
import { useClanInvites } from "@/hooks/useClanInvites";
import { usePinnedFriends, useFavoriteFriends } from "@/hooks/useFriendPreferences";
import { useNotificationCount } from "@/hooks/useNotificationCount";
import { toast } from "sonner";
import { FriendsSidebar, type SidebarSectionDef } from "@/components/friends/FriendsSidebar";
import { DashboardStats } from "@/components/friends/DashboardStats";
import { EmptyState } from "@/components/friends/EmptyState";
import { MyFriendsSection } from "@/components/friends/MyFriendsSection";
import { FriendProfileDrawer } from "@/components/friends/FriendProfileDrawer";
import { IncomingRequestCard, OutgoingRequestCard } from "@/components/friends/RequestCard";
import { IncomingChallengeCard, OutgoingChallengeCard } from "@/components/friends/ChallengeCard";
import { ClanInviteCard } from "@/components/friends/ClanInviteCard";
import { AddFriendPanel } from "@/components/friends/AddFriendPanel";
import { ChallengeModal } from "@/components/friends/ChallengeModal";
import type { FriendRow } from "@/types/friend";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/friends")({
  head: () =>
    noindexSeo(
      "Chess Friends — ChessOx",
      "Manage your chess friends on ChessOx: friend requests, challenges and club invites.",
    ),
  component: FriendsPage,
});

type SectionKey = "friends" | "requests" | "challenges" | "clan-invites" | "add";

function stagger(i: number): React.CSSProperties {
  return { animationDelay: `${Math.min(i, 10) * 45}ms` };
}

function FriendsPage() {
  const { user } = useAuth();
  const { friends, loading, sendRequest, acceptRequest, declineRequest, removeFriend } = useFriends(
    user?.id,
  );
  const {
    incoming: incomingChallenges,
    outgoing: outgoingChallenges,
    loading: challengesLoading,
    sendChallenge,
    respond: respondChallenge,
    cancel: cancelChallenge,
  } = useChallenges(user?.id);
  const {
    invites: clanInvites,
    loading: clanInvitesLoading,
    respond: respondClanInvite,
  } = useClanInvites(user?.id);
  const { ids: pinnedIds, toggle: togglePin } = usePinnedFriends(user?.id);
  const { ids: favoriteIds, toggle: toggleFavorite } = useFavoriteFriends(user?.id);
  const unreadNotifications = useNotificationCount(user?.id);

  const [section, setSection] = useState<SectionKey>("friends");
  const [profileFriend, setProfileFriend] = useState<FriendRow | null>(null);
  const [challengeTarget, setChallengeTarget] = useState<FriendRow | null>(null);

  const accepted = friends
    .filter((f) => f.status === "accepted")
    .map((f) => ({
      ...f,
      is_pinned: pinnedIds.has(f.other_id),
      is_favorite: favoriteIds.has(f.other_id),
    }));
  const incomingRequests = friends.filter(
    (f) => f.status === "pending" && f.addressee_id === user?.id,
  );
  const outgoingRequests = friends.filter(
    (f) => f.status === "pending" && f.requester_id === user?.id,
  );
  const onlineNow = accepted.filter((f) => f.other_is_online).length;

  const myFriendIds = new Set(accepted.map((f) => f.other_id));
  const knownIds = new Set(friends.map((f) => f.other_id));

  function handleRemove(id: string) {
    removeFriend(id);
    toast.success("Removed friend");
    setProfileFriend(null);
  }

  async function handleSendChallenge(opts: Parameters<typeof sendChallenge>[1]) {
    if (!challengeTarget) return;
    try {
      await sendChallenge(challengeTarget.other_id, opts);
      toast.success("Challenge sent!");
      setChallengeTarget(null);
      setSection("challenges");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send challenge");
    }
  }

  if (!user) {
    return (
      <PageShell eyebrow="Fellowship" title="Friends">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Sign in to manage your friends.</p>
          <div className="mt-4">
            <Link to="/auth">
              <GoldButton>Sign in</GoldButton>
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  const sections: SidebarSectionDef[] = [
    { key: "friends", label: "My Friends", icon: Users, count: accepted.length },
    { key: "requests", label: "Friend Requests", icon: Inbox, count: incomingRequests.length },
    { key: "challenges", label: "Challenges", icon: Swords, count: incomingChallenges.length },
    { key: "add", label: "Add Friend", icon: UserPlus },
  ];

  return (
    <PageShell
      eyebrow="Fellowship"
      title="Friends Hub"
      subtitle="Challenge your allies, track their victories, grow your fellowship."
    >
      <DashboardStats
        stats={[
          { key: "total", label: "Total Friends", value: accepted.length, icon: Users },
          { key: "online", label: "Online", value: onlineNow, icon: Wifi, tone: "emerald" },
          {
            key: "requests",
            label: "Pending Requests",
            value: incomingRequests.length,
            icon: Inbox,
            tone: incomingRequests.length > 0 ? "gold" : undefined,
          },
          {
            key: "challenges",
            label: "Pending Challenges",
            value: incomingChallenges.length,
            icon: Swords,
            tone: incomingChallenges.length > 0 ? "gold" : undefined,
          },
          {
            key: "notifs",
            label: "Notifications",
            value: unreadNotifications,
            icon: Bell,
            tone: unreadNotifications > 0 ? "gold" : undefined,
          },
        ]}
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <FriendsSidebar
          sections={sections}
          active={section}
          onChange={(k) => setSection(k as SectionKey)}
        />

        <div className="min-w-0 flex-1">
          {section === "friends" &&
            (loading ? (
              <FriendGridSkeleton />
            ) : (
              <MyFriendsSection
                friends={accepted}
                onRemove={handleRemove}
                onOpenChallenge={setChallengeTarget}
                onOpenProfile={setProfileFriend}
                onTogglePin={(id) =>
                  togglePin(id).catch(() => toast.error("Max 3 pinned friends allowed"))
                }
                onToggleFavorite={(id) => toggleFavorite(id)}
                onGoToAdd={() => setSection("add")}
              />
            ))}

          {section === "requests" &&
            (loading ? (
              <ListSkeleton />
            ) : incomingRequests.length === 0 && outgoingRequests.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No Requests"
                subtitle="You're all caught up — no pending friend requests."
              />
            ) : (
              <div className="space-y-8">
                <div>
                  <div className="mb-3 font-display text-xl">Incoming Requests</div>
                  {incomingRequests.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No incoming requests.</p>
                  ) : (
                    <div className="space-y-2">
                      {incomingRequests.map((r, i) => (
                        <IncomingRequestCard
                          key={r.id}
                          request={r}
                          style={stagger(i)}
                          myFriendIds={myFriendIds}
                          onAccept={(id) => {
                            acceptRequest(id);
                            toast.success("Friend accepted!");
                          }}
                          onReject={(id) => declineRequest(id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="mb-3 font-display text-xl">Outgoing Requests</div>
                  {outgoingRequests.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No outgoing requests.</p>
                  ) : (
                    <div className="space-y-2">
                      {outgoingRequests.map((r, i) => (
                        <OutgoingRequestCard
                          key={r.id}
                          request={r}
                          style={stagger(i)}
                          onCancel={(id) => declineRequest(id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

          {section === "challenges" &&
            (challengesLoading ? (
              <ListSkeleton />
            ) : incomingChallenges.length === 0 && outgoingChallenges.length === 0 ? (
              <EmptyState
                icon={Swords}
                title="No Challenges"
                subtitle="Challenge a friend from My Friends to spar over the board."
              />
            ) : (
              <div className="space-y-8">
                <div>
                  <div className="mb-3 font-display text-xl">Incoming Challenges</div>
                  {incomingChallenges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No incoming challenges.</p>
                  ) : (
                    <div className="space-y-2">
                      {incomingChallenges.map((c, i) => (
                        <IncomingChallengeCard
                          key={c.id}
                          challenge={c}
                          style={stagger(i)}
                          onRespond={respondChallenge}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="mb-3 font-display text-xl">Outgoing Challenges</div>
                  {outgoingChallenges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No outgoing challenges.</p>
                  ) : (
                    <div className="space-y-2">
                      {outgoingChallenges.map((c, i) => (
                        <OutgoingChallengeCard
                          key={c.id}
                          challenge={c}
                          style={stagger(i)}
                          onCancel={cancelChallenge}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

          {section === "add" && (
            <AddFriendPanel
              userId={user.id}
              knownIds={knownIds}
              myFriendIds={myFriendIds}
              onSendRequest={sendRequest}
            />
          )}
        </div>
      </div>

      {profileFriend && (
        <FriendProfileDrawer
          friend={profileFriend}
          myUserId={user.id}
          onClose={() => setProfileFriend(null)}
          onChallenge={() => {
            setChallengeTarget(profileFriend);
            setProfileFriend(null);
          }}
          onRemove={handleRemove}
        />
      )}

      {challengeTarget && (
        <ChallengeModal
          opponentName={challengeTarget.other_display ?? challengeTarget.other_username ?? "friend"}
          onClose={() => setChallengeTarget(null)}
          onSend={handleSendChallenge}
        />
      )}
    </PageShell>
  );
}

function FriendGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="surface-card skeleton-shimmer h-[268px] rounded-[22px]" />
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-[76px] rounded-2xl" />
      ))}
    </div>
  );
}
