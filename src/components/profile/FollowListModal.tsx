import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Search, X, UserCheck, UserPlus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserAvatar } from "@/components/site/UserAvatar";
import { SeasonShield } from "@/components/ranking/SeasonShield";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { useAuth } from "@/hooks/useAuth";
import { useCommunityActions } from "@/hooks/useCommunity";
import { fetchFollowList, type CommunityUserLite } from "@/lib/api/communityClient";

export function FollowListModal({
  userId,
  initialKind,
  onClose,
  onCountChange,
}: {
  userId: string;
  initialKind: "followers" | "following";
  onClose: () => void;
  onCountChange?: (kind: "followers" | "following", delta: number) => void;
}) {
  const [kind, setKind] = useState<"followers" | "following">(initialKind);
  const [searchQuery, setSearchQuery] = useState("");
  const { user } = useAuth();
  const actions = useCommunityActions();

  const { data: rawData = [], isLoading, isError } = useQuery({
    queryKey: ["community_follow_list", userId, kind],
    queryFn: () => fetchFollowList(userId, kind, 100),
    staleTime: 10_000,
  });

  const [optimisticFollowing, setOptimisticFollowing] = useState<Record<string, boolean>>({});

  const users = useMemo(() => {
    return rawData.map((u) => {
      const isFollowing =
        optimisticFollowing[u.id] !== undefined ? optimisticFollowing[u.id] : !!u.is_following;
      return { ...u, is_following: isFollowing };
    });
  }, [rawData, optimisticFollowing]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase().trim();
    return users.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q),
    );
  }, [users, searchQuery]);

  const handleToggleFollow = async (targetUser: CommunityUserLite) => {
    if (!user) {
      toast.error("Please sign in to follow players");
      return;
    }
    const current = !!targetUser.is_following;
    const next = !current;

    setOptimisticFollowing((prev) => ({ ...prev, [targetUser.id]: next }));

    if (onCountChange) {
      if (user.id === userId && kind === "following") {
        onCountChange("following", next ? 1 : -1);
      }
    }

    try {
      await actions.follow.mutateAsync(targetUser.id);
    } catch (e) {
      setOptimisticFollowing((prev) => ({ ...prev, [targetUser.id]: current }));
      toast.error("Failed to update follow status");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12151a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Tabs & Close */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 pt-4 pb-2">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setKind("followers")}
              className={`text-base font-semibold transition-colors pb-1 border-b-2 ${
                kind === "followers"
                  ? "border-gold text-gold"
                  : "border-transparent text-muted-foreground hover:text-white"
              }`}
            >
              Followers
            </button>
            <button
              type="button"
              onClick={() => setKind("following")}
              className={`text-base font-semibold transition-colors pb-1 border-b-2 ${
                kind === "following"
                  ? "border-gold text-gold"
                  : "border-transparent text-muted-foreground hover:text-white"
              }`}
            >
              Following
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-white/5">
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${kind}...`}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] pl-9 pr-8 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-gold/40 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 text-muted-foreground hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* User List Container */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 divide-y divide-white/5">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2 animate-pulse">
                  <div className="h-10 w-10 rounded-full bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-28 rounded bg-white/10" />
                    <div className="h-3 w-20 rounded bg-white/5" />
                  </div>
                  <div className="h-7 w-20 rounded-full bg-white/10 shrink-0" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-xs text-rose-400">
              Failed to load list. Please try again.
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              {searchQuery ? (
                <>
                  No users found matching "<span className="text-white">{searchQuery}</span>"
                </>
              ) : kind === "followers" ? (
                "No followers yet."
              ) : (
                "Not following anyone yet."
              )}
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isSelf = user?.id === u.id;
              const isFollowing = u.is_following;
              const spValue = u.season_points ?? u.iq_level ?? u.metric ?? 100;

              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 py-2.5 px-1.5 hover:bg-white/[0.02] rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Link
                      to="/u/$username"
                      params={{ username: u.username }}
                      onClick={onClose}
                      className="shrink-0"
                    >
                      <UserAvatar avatarUrl={u.avatar_url} displayName={u.full_name} size="md" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/u/$username"
                        params={{ username: u.username }}
                        onClick={onClose}
                        className="flex items-center gap-1.5 truncate text-xs sm:text-sm font-medium text-white hover:text-gold transition-colors"
                      >
                        <span className="truncate">{u.full_name}</span>
                        {u.premium_tier && u.premium_tier !== "free" && (
                          <PremiumBadge className="h-4 w-4 shrink-0" premiumActive />
                        )}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                        <span>@{u.username}</span>
                        <span>·</span>
                        <SeasonShield
                          sp={spValue}
                          rungId={u.rung_id}
                          size="xs"
                          variant="chip"
                          className="py-0 px-1.5 text-[10px]"
                        />
                        <span>·</span>
                        <span className="font-mono text-gold/90">{spValue} SP</span>
                      </div>
                    </div>
                  </div>

                  {!isSelf && user && (
                    <button
                      type="button"
                      onClick={() => handleToggleFollow(u)}
                      className={`flex items-center justify-center gap-1 rounded-full px-3.5 py-1 text-xs font-medium transition-all shrink-0 ${
                        isFollowing
                          ? "border border-white/15 bg-white/5 text-muted-foreground hover:border-rose-500/40 hover:text-rose-400"
                          : "gradient-gold text-background font-semibold hover:brightness-110 shadow-sm"
                      }`}
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>Following</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-3.5 w-3.5" />
                          <span>Follow</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
