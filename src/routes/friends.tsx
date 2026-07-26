import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { Users, Inbox, Swords, Shield, UserPlus, Loader2, Activity } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useFriends } from "@/hooks/useFriends";
import { useChallenges } from "@/hooks/useChallenges";
import { useClanInvites } from "@/hooks/useClanInvites";
import { toast } from "sonner";
import { FriendTabs, type FriendTabDef } from "@/components/friends/Tabs";
import { EmptyState } from "@/components/friends/EmptyState";
import { FriendCard } from "@/components/friends/FriendCard";
import { IncomingRequestCard, OutgoingRequestCard } from "@/components/friends/RequestCard";
import { IncomingChallengeCard, OutgoingChallengeCard } from "@/components/friends/ChallengeCard";
import { ClanInviteCard } from "@/components/friends/ClanInviteCard";
import { AddFriendPanel } from "@/components/friends/AddFriendPanel";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/friends")({
  head: () =>
    noindexSeo(
      "Chess Friends — ChessOx",
      "Manage your chess friends on ChessOx: friend requests, challenges and club invites.",
    ),
  component: FriendsPage,
});

type TabKey = "friends" | "requests" | "challenges" | "clan-invites" | "add";

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
  const [tab, setTab] = useState<TabKey>("friends");

  const accepted = friends.filter((f) => f.status === "accepted");
  const incomingRequests = friends.filter(
    (f) => f.status === "pending" && f.addressee_id === user?.id,
  );
  const outgoingRequests = friends.filter(
    (f) => f.status === "pending" && f.requester_id === user?.id,
  );

  const myFriendIds = new Set(accepted.map((f) => f.other_id));
  const knownIds = new Set(friends.map((f) => f.other_id));

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

  const tabs: FriendTabDef[] = [
    { key: "friends", label: "My Friends", count: accepted.length, icon: Users },
    { key: "requests", label: "Friend Requests", count: incomingRequests.length, icon: Inbox },
    { key: "challenges", label: "Challenges", count: incomingChallenges.length, icon: Swords },
    { key: "clan-invites", label: "Clan Invites", count: clanInvites.length, icon: Shield },
    { key: "add", label: "Add Friend", count: 0, icon: UserPlus },
  ];

  return (
    <PageShell
      eyebrow="Fellowship"
      title="Friends"
      subtitle="Challenge your allies, track their victories."
      action={
        <Link to="/friends/activity">
          <GoldButton>
            <Activity className="h-4 w-4" /> Activity
          </GoldButton>
        </Link>
      }
    >
      <FriendTabs tabs={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />

      {tab === "friends" &&
        (loading ? (
          <Loading />
        ) : accepted.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No Friends Yet"
            subtitle="Search for players in the Add Friend tab to start building your fellowship."
            action={
              <GoldButton onClick={() => setTab("add")}>
                <UserPlus className="h-4 w-4" /> Add a Friend
              </GoldButton>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accepted.map((f) => (
              <FriendCard
                key={f.id}
                friend={f}
                onRemove={(id) => {
                  removeFriend(id);
                  toast.success("Removed friend");
                }}
                onChallenge={async (opponentId, opts) => {
                  try {
                    await sendChallenge(opponentId, opts);
                    toast.success("Challenge sent!");
                    setTab("challenges");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to send challenge");
                  }
                }}
              />
            ))}
          </div>
        ))}

      {tab === "requests" &&
        (loading ? (
          <Loading />
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
                  {incomingRequests.map((r) => (
                    <IncomingRequestCard
                      key={r.id}
                      request={r}
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
                  {outgoingRequests.map((r) => (
                    <OutgoingRequestCard
                      key={r.id}
                      request={r}
                      onCancel={(id) => declineRequest(id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

      {tab === "challenges" &&
        (challengesLoading ? (
          <Loading />
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
                  {incomingChallenges.map((c) => (
                    <IncomingChallengeCard key={c.id} challenge={c} onRespond={respondChallenge} />
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
                  {outgoingChallenges.map((c) => (
                    <OutgoingChallengeCard key={c.id} challenge={c} onCancel={cancelChallenge} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

      {tab === "clan-invites" &&
        (clanInvitesLoading ? (
          <Loading />
        ) : clanInvites.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="No Clan Invites"
            subtitle="Invitations from clan leaders will show up here."
          />
        ) : (
          <div className="space-y-2">
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
                    toast.error(e instanceof Error ? e.message : "Failed to respond to invite");
                  }
                }}
              />
            ))}
          </div>
        ))}

      {tab === "add" && (
        <AddFriendPanel userId={user.id} knownIds={knownIds} onSendRequest={sendRequest} />
      )}
    </PageShell>
  );
}

function Loading() {
  return (
    <div className="grid place-items-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-gold" />
    </div>
  );
}
