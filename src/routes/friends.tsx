import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import { UserPlus, UserCheck, UserX, Loader2, Users, Swords } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useFriends } from "@/hooks/useFriends";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/friends")({
  head: () => ({ meta: [{ title: "Friends — ChessOx" }] }),
  component: FriendsPage,
});

function FriendsPage() {
  const { user } = useAuth();
  const { friends, loading, sendRequest, acceptRequest, declineRequest, removeFriend } = useFriends(
    user?.id,
  );
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; username: string; display_name: string | null }[]
  >([]);
  const [searching, setSearching] = useState(false);

  const accepted = friends.filter((f) => f.status === "accepted");
  const incoming = friends.filter((f) => f.status === "pending" && f.addressee_id === user?.id);
  const outgoing = friends.filter((f) => f.status === "pending" && f.requester_id === user?.id);

  async function doSearch() {
    if (!search.trim()) return;
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id,username,display_name")
      .ilike("username", `%${search.trim()}%`)
      .neq("id", user?.id ?? "")
      .limit(10);
    setSearchResults(
      (data ?? []) as { id: string; username: string; display_name: string | null }[],
    );
    setSearching(false);
  }

  const knownIds = new Set(
    friends.map((f) => (f.requester_id === user?.id ? f.addressee_id : f.requester_id)),
  );

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

  return (
    <PageShell
      eyebrow="Fellowship"
      title="Friends"
      subtitle="Challenge your allies, track their victories."
    >
      {/* Search to add */}
      <Card className="mb-8 p-5">
        <div className="mb-3 font-display text-lg">Add a Friend</div>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") doSearch();
            }}
            placeholder="Search by username…"
            className="flex-1 rounded-full border border-gold/20 bg-white/[0.02] px-4 py-2 text-sm outline-none focus:border-gold/40"
          />
          <GoldButton onClick={doSearch} disabled={searching}>
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Search
          </GoldButton>
        </div>
        {searchResults.length > 0 && (
          <ul className="mt-3 space-y-2">
            {searchResults.map((p) => {
              const alreadyFriend = knownIds.has(p.id);
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-white/5 p-3 text-sm"
                >
                  <div className="grid h-9 w-9 place-items-center rounded-full gradient-gold text-[#0B0D10] font-bold">
                    {p.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div>{p.display_name ?? p.username}</div>
                    <div className="text-xs text-muted-foreground">@{p.username}</div>
                  </div>
                  {alreadyFriend ? (
                    <span className="text-xs text-muted-foreground">Already connected</span>
                  ) : (
                    <GoldButton
                      onClick={async () => {
                        await sendRequest(p.id);
                        setSearchResults([]);
                        toast.success(`Friend request sent to @${p.username}`);
                      }}
                    >
                      <UserPlus className="h-4 w-4" /> Add
                    </GoldButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {loading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : (
        <div className="space-y-8">
          {incoming.length > 0 && (
            <div>
              <div className="mb-3 font-display text-xl">
                Incoming Requests{" "}
                <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-sm text-gold">
                  {incoming.length}
                </span>
              </div>
              <div className="space-y-2">
                {incoming.map((f) => (
                  <Card key={f.id} className="flex items-center gap-3 p-4">
                    <div className="grid h-10 w-10 place-items-center rounded-full gradient-gold text-[#0B0D10] font-bold">
                      {(f.other_display ?? f.other_username ?? "?")[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm">
                        {f.other_display ?? f.other_username ?? "Unknown"}
                      </div>
                      <div className="text-xs text-muted-foreground">@{f.other_username}</div>
                    </div>
                    <div className="flex gap-2">
                      <GoldButton
                        onClick={() => {
                          acceptRequest(f.id);
                          toast.success("Friend accepted!");
                        }}
                      >
                        <UserCheck className="h-4 w-4" /> Accept
                      </GoldButton>
                      <GhostButton onClick={() => declineRequest(f.id)}>
                        <UserX className="h-4 w-4" /> Decline
                      </GhostButton>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {outgoing.length > 0 && (
            <div>
              <div className="mb-3 font-display text-xl">Sent Requests</div>
              <div className="space-y-2">
                {outgoing.map((f) => (
                  <Card key={f.id} className="flex items-center gap-3 p-4">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-gold/10 text-gold font-bold">
                      {(f.other_display ?? f.other_username ?? "?")[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm">
                        {f.other_display ?? f.other_username ?? "Unknown"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        @{f.other_username} · Pending
                      </div>
                    </div>
                    <GhostButton onClick={() => declineRequest(f.id)}>Cancel</GhostButton>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-3 font-display text-xl">
              Friends{" "}
              <span className="ml-2 text-muted-foreground text-base">({accepted.length})</span>
            </div>
            {accepted.length === 0 ? (
              <Card className="p-8 text-center">
                <Users className="mx-auto h-10 w-10 text-gold/30" />
                <p className="mt-4 text-muted-foreground">
                  No friends yet. Search for players above to connect!
                </p>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {accepted.map((f) => (
                  <Card key={f.id} className="flex items-center gap-3 p-4">
                    <div className="grid h-10 w-10 place-items-center rounded-full gradient-gold text-[#0B0D10] font-bold">
                      {(f.other_display ?? f.other_username ?? "?")[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm">
                        {f.other_display ?? f.other_username ?? "Unknown"}
                      </div>
                      <div className="text-xs text-muted-foreground">@{f.other_username}</div>
                    </div>
                    <div className="flex gap-2">
                      <Link to="/play/friend">
                        <GoldButton>
                          <Swords className="h-4 w-4" />
                        </GoldButton>
                      </Link>
                      <GhostButton
                        onClick={() => {
                          removeFriend(f.id);
                          toast.success("Removed friend");
                        }}
                      >
                        <UserX className="h-4 w-4" />
                      </GhostButton>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
