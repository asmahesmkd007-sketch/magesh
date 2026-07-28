import { useEffect, useRef, useState } from "react";
import {
  Search,
  UserPlus,
  Loader2,
  History,
  Sparkles,
  X,
  UserSearch,
  Swords,
  Users2,
} from "lucide-react";
import { Card, GoldButton } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { SearchProfile } from "@/types/friend";

const RECENTS_KEY = "chessox:friend-search-recents";

function loadRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecent(term: string) {
  const recents = [term, ...loadRecents().filter((t) => t !== term)].slice(0, 6);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  return recents;
}

async function withRatings(profiles: SearchProfile[]): Promise<SearchProfile[]> {
  if (profiles.length === 0) return profiles;
  const { data } = await supabase
    .from("ratings")
    .select("user_id,rating")
    .eq("time_class", "rapid")
    .in(
      "user_id",
      profiles.map((p) => p.id),
    );
  const ratingMap = new Map((data ?? []).map((r) => [r.user_id, r.rating]));
  return profiles.map((p) => ({ ...p, rating: ratingMap.get(p.id) ?? 100 }));
}

export function AddFriendPanel({
  userId,
  knownIds,
  myFriendIds,
  onSendRequest,
}: {
  userId: string;
  knownIds: Set<string>;
  myFriendIds: Set<string>;
  onSendRequest: (id: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<SearchProfile[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(true);
  const [recentlyPlayed, setRecentlyPlayed] = useState<SearchProfile[]>([]);
  const [mutualPlayers, setMutualPlayers] = useState<SearchProfile[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setRecents(loadRecents());
  }, []);

  // Suggested Friends: top-rated (rapid) players not already known.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("ratings")
      .select("user_id,rating")
      .eq("time_class", "rapid")
      .order("rating", { ascending: false })
      .limit(30)
      .then(async ({ data: ratingRows }) => {
        if (cancelled) return;
        const ids = (ratingRows ?? [])
          .map((r) => r.user_id)
          .filter((id) => id !== userId && !knownIds.has(id));
        if (ids.length === 0) {
          setSuggested([]);
          setSuggestedLoading(false);
          return;
        }
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id,username,full_name,avatar_url,premium_active,premium_expires_at")
          .in("id", ids.slice(0, 8));
        if (cancelled) return;
        const ratingMap = new Map((ratingRows ?? []).map((r) => [r.user_id, r.rating]));
        const ordered = ids
          .slice(0, 8)
          .map((id) => (profiles ?? []).find((p) => p.id === id))
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map((p) => ({ ...p, rating: ratingMap.get(p.id) ?? 100 }));
        setSuggested(ordered);
        setSuggestedLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Recently Played Players: opponents from my most recent finished games.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("games")
      .select("white_id,black_id,white_username,black_username,ended_at")
      .or(`white_id.eq.${userId},black_id.eq.${userId}`)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(20)
      .then(async ({ data }) => {
        if (cancelled) return;
        const opponentIds: string[] = [];
        for (const g of data ?? []) {
          const oppId = g.white_id === userId ? g.black_id : g.white_id;
          if (oppId && oppId !== userId && !knownIds.has(oppId) && !opponentIds.includes(oppId)) {
            opponentIds.push(oppId);
          }
          if (opponentIds.length >= 6) break;
        }
        if (opponentIds.length === 0) {
          setRecentlyPlayed([]);
          return;
        }
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id,username,full_name,avatar_url,premium_active,premium_expires_at")
          .in("id", opponentIds);
        if (cancelled) return;
        setRecentlyPlayed(await withRatings((profiles ?? []) as SearchProfile[]));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Mutual Players: friends-of-my-friends who aren't connected to me yet.
  useEffect(() => {
    if (myFriendIds.size === 0) {
      setMutualPlayers([]);
      return;
    }
    let cancelled = false;
    const ids = [...myFriendIds];
    supabase
      .from("friends")
      .select("requester_id,addressee_id")
      .eq("status", "accepted")
      .or(ids.map((id) => `requester_id.eq.${id},addressee_id.eq.${id}`).join(","))
      .then(async ({ data }) => {
        if (cancelled || !data) return;
        const counts = new Map<string, number>();
        for (const row of data) {
          for (const side of [row.requester_id, row.addressee_id]) {
            if (side && side !== userId && !myFriendIds.has(side)) {
              counts.set(side, (counts.get(side) ?? 0) + 1);
            }
          }
        }
        const topIds = [...counts.entries()]
          .filter(([id]) => !knownIds.has(id))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([id]) => id);
        if (topIds.length === 0) {
          setMutualPlayers([]);
          return;
        }
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id,username,full_name,avatar_url,premium_active,premium_expires_at")
          .in("id", topIds);
        if (cancelled) return;
        const withCounts = (profiles ?? []).map((p) => ({
          ...p,
          mutual_count: counts.get(p.id) ?? 0,
        }));
        setMutualPlayers(await withRatings(withCounts as SearchProfile[]));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, myFriendIds.size]);

  async function doSearch(term?: string) {
    const q = (term ?? search).trim();
    if (!q) return;
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id,username,full_name,avatar_url,premium_active,premium_expires_at")
      .ilike("username", `%${q}%`)
      .neq("id", userId)
      .limit(10);
    setResults(await withRatings((data ?? []) as SearchProfile[]));
    setRecents(saveRecent(q));
    setSearching(false);
    setSearched(true);
  }

  // Autocomplete: live search-as-you-type, debounced, without polluting recents.
  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("profiles")
        .select("id,username,full_name,avatar_url,premium_active,premium_expires_at")
        .ilike("username", `%${value.trim()}%`)
        .neq("id", userId)
        .limit(10);
      setResults(await withRatings((data ?? []) as SearchProfile[]));
      setSearching(false);
      setSearched(true);
    }, 350);
  }

  async function handleSend(p: SearchProfile) {
    setSendingId(p.id);
    try {
      await onSendRequest(p.id);
      setResults((prev) => prev.filter((r) => r.id !== p.id));
      setSuggested((prev) => prev.filter((r) => r.id !== p.id));
      setRecentlyPlayed((prev) => prev.filter((r) => r.id !== p.id));
      setMutualPlayers((prev) => prev.filter((r) => r.id !== p.id));
      toast.success(`Friend request sent to @${p.username}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send friend request");
    } finally {
      setSendingId(null);
    }
  }

  function renderRow(p: SearchProfile) {
    const already = knownIds.has(p.id);
    return (
      <li
        key={p.id}
        className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.015] p-3 text-sm transition-colors duration-200 hover:border-gold/20 hover:bg-white/[0.03]"
      >
        <UserAvatar avatarUrl={p.avatar_url} displayName={p.full_name ?? p.username} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center truncate">
            {p.full_name ?? p.username}
            <PremiumBadge
              premiumActive={p.premium_active}
              premiumExpiresAt={p.premium_expires_at}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            @{p.username}
            {typeof p.rating === "number" && <> · {p.rating} rating</>}
            {!!p.mutual_count && (
              <>
                {" "}
                · {p.mutual_count} mutual friend{p.mutual_count === 1 ? "" : "s"}
              </>
            )}
          </div>
        </div>
        {already ? (
          <span className="shrink-0 text-xs text-muted-foreground">Already connected</span>
        ) : (
          <GoldButton
            onClick={() => handleSend(p)}
            disabled={sendingId === p.id}
            className="shrink-0"
          >
            {sendingId === p.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Add
          </GoldButton>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="animate-rise-in relative overflow-hidden p-5 sm:p-6">
        <div className="mb-1 flex items-center gap-2 font-display text-lg">
          <UserSearch className="h-5 w-5 text-gold" /> Search by Username
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Find fellow players and send them a friend request.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doSearch();
              }}
              placeholder="Search by username…"
              aria-label="Search by username"
              className="royal-input w-full rounded-full py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gold/40"
            />
          </div>
          <GoldButton onClick={() => doSearch()} disabled={searching}>
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Search</span>
          </GoldButton>
        </div>

        {!search && recents.length > 0 && results.length === 0 && (
          <div className="mt-4 animate-rise-in">
            <div className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <History className="h-3.5 w-3.5" /> Recent searches
            </div>
            <div className="flex flex-wrap gap-2">
              {recents.map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setSearch(r);
                    doSearch(r);
                  }}
                  className="royal-chip rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-gold"
                >
                  {r}
                </button>
              ))}
              <button
                onClick={() => {
                  localStorage.removeItem(RECENTS_KEY);
                  setRecents([]);
                }}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground/60 hover:text-destructive"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            </div>
          </div>
        )}

        {searching ? (
          <div className="mt-4 space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton-shimmer h-[58px] rounded-xl" />
            ))}
          </div>
        ) : results.length > 0 ? (
          <ul className="mt-4 space-y-2 animate-rise-in">{results.map(renderRow)}</ul>
        ) : (
          searched && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              No players found for "{search}".
            </p>
          )
        )}
      </Card>

      {mutualPlayers.length > 0 && (
        <Card className="animate-rise-in p-5 sm:p-6">
          <div className="mb-1 flex items-center gap-1.5 font-display text-lg">
            <Users2 className="h-4 w-4 text-gold" /> Mutual Players
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Friends of your friends you haven't connected with yet.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">{mutualPlayers.map(renderRow)}</ul>
        </Card>
      )}

      {recentlyPlayed.length > 0 && (
        <Card className="animate-rise-in p-5 sm:p-6">
          <div className="mb-1 flex items-center gap-1.5 font-display text-lg">
            <Swords className="h-4 w-4 text-gold" /> Recently Played
          </div>
          <p className="mb-4 text-sm text-muted-foreground">Opponents from your recent games.</p>
          <ul className="grid gap-2 sm:grid-cols-2">{recentlyPlayed.map(renderRow)}</ul>
        </Card>
      )}

      {!suggestedLoading && suggested.length > 0 && (
        <Card className="animate-rise-in p-5 sm:p-6">
          <div className="mb-1 flex items-center gap-1.5 font-display text-lg">
            <Sparkles className="h-4 w-4 text-gold" /> Suggested Friends
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Top-rated players you haven't added yet.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">{suggested.map(renderRow)}</ul>
        </Card>
      )}
    </div>
  );
}
