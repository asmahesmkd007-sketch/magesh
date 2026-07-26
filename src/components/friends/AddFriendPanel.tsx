import { useEffect, useState } from "react";
import { Search, UserPlus, Loader2, History, Sparkles, X } from "lucide-react";
import { Card, GoldButton, GhostButton } from "@/components/site/Primitives";
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

export function AddFriendPanel({
  userId,
  knownIds,
  onSendRequest,
}: {
  userId: string;
  knownIds: Set<string>;
  onSendRequest: (id: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<SearchProfile[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(true);

  useEffect(() => {
    setRecents(loadRecents());
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("profiles")
      .select("id,username,full_name,avatar_url,premium_active,premium_expires_at")
      .neq("id", userId)
      .order("iq_rating", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (cancelled) return;
        const pool = ((data ?? []) as SearchProfile[]).filter((p) => !knownIds.has(p.id));
        setSuggested(pool.slice(0, 5));
        setSuggestedLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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
    setResults((data ?? []) as SearchProfile[]);
    setRecents(saveRecent(q));
    setSearching(false);
  }

  async function handleSend(p: SearchProfile) {
    await onSendRequest(p.id);
    setResults((prev) => prev.filter((r) => r.id !== p.id));
    setSuggested((prev) => prev.filter((r) => r.id !== p.id));
    toast.success(`Friend request sent to @${p.username}`);
  }

  function renderRow(p: SearchProfile) {
    const already = knownIds.has(p.id);
    return (
      <li
        key={p.id}
        className="flex items-center gap-3 rounded-xl border border-white/5 p-3 text-sm"
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
          <div className="text-xs text-muted-foreground">@{p.username}</div>
        </div>
        {already ? (
          <span className="shrink-0 text-xs text-muted-foreground">Already connected</span>
        ) : (
          <GoldButton onClick={() => handleSend(p)} className="shrink-0">
            <UserPlus className="h-4 w-4" /> Add
          </GoldButton>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-3 font-display text-lg">Search by Username</div>
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
          <GoldButton onClick={() => doSearch()} disabled={searching}>
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Search
          </GoldButton>
        </div>

        {!search && recents.length > 0 && results.length === 0 && (
          <div className="mt-4">
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
                  className="royal-chip rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-gold"
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

        {results.length > 0 && <ul className="mt-4 space-y-2">{results.map(renderRow)}</ul>}
      </Card>

      {!suggestedLoading && suggested.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-1.5 font-display text-lg">
            <Sparkles className="h-4 w-4 text-gold" /> Suggested Friends
          </div>
          <ul className="space-y-2">{suggested.map(renderRow)}</ul>
        </Card>
      )}
    </div>
  );
}
