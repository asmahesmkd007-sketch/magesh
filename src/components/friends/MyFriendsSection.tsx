import { useMemo, useState } from "react";
import { Search, Users, UserPlus, X } from "lucide-react";
import { GoldButton } from "@/components/site/Primitives";
import { EmptyState } from "@/components/friends/EmptyState";
import { FriendCard } from "@/components/friends/FriendCard";
import type { FriendRow, FriendSortKey } from "@/types/friend";

const SORT_OPTIONS: { key: FriendSortKey; label: string }[] = [
  { key: "online", label: "Online First" },
  { key: "favorites", label: "Favorites" },
  { key: "recent", label: "Recently Active" },
  { key: "alphabetical", label: "Alphabetical" },
];

const PAGE_SIZE = 12;

function sortFriends(friends: FriendRow[], sort: FriendSortKey): FriendRow[] {
  const arr = [...friends];
  switch (sort) {
    case "online":
      return arr.sort((a, b) => Number(!!b.other_is_online) - Number(!!a.other_is_online));
    case "favorites":
      return arr.sort((a, b) => Number(!!b.is_favorite) - Number(!!a.is_favorite));
    case "recent":
      return arr.sort((a, b) => {
        const at = a.other_last_seen ? new Date(a.other_last_seen).getTime() : 0;
        const bt = b.other_last_seen ? new Date(b.other_last_seen).getTime() : 0;
        return bt - at;
      });
    case "alphabetical":
      return arr.sort((a, b) =>
        (a.other_display ?? a.other_username ?? "").localeCompare(
          b.other_display ?? b.other_username ?? "",
        ),
      );
  }
}

export function MyFriendsSection({
  friends,
  onRemove,
  onOpenChallenge,
  onOpenProfile,
  onTogglePin,
  onToggleFavorite,
  onGoToAdd,
}: {
  friends: FriendRow[];
  onRemove: (id: string) => void;
  onOpenChallenge: (friend: FriendRow) => void;
  onOpenProfile: (friend: FriendRow) => void;
  onTogglePin: (friendUserId: string) => void;
  onToggleFavorite: (friendUserId: string) => void;
  onGoToAdd: () => void;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<FriendSortKey>("online");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = friends;
    if (q) {
      list = list.filter((f) => {
        const name = (f.other_display ?? "").toLowerCase();
        const uname = (f.other_username ?? "").toLowerCase();
        return name.includes(q) || uname.includes(q);
      });
    }
    if (onlineOnly) list = list.filter((f) => f.other_is_online);
    if (offlineOnly) list = list.filter((f) => !f.other_is_online);
    if (favoritesOnly) list = list.filter((f) => f.is_favorite);
    return sortFriends(list, sort);
  }, [friends, search, sort, onlineOnly, offlineOnly, favoritesOnly]);

  const visible = filtered.slice(0, visibleCount);
  const hasFilters = !!search || onlineOnly || offlineOnly || favoritesOnly;

  if (friends.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No Friends Yet"
        subtitle="Search for players in the Add Friend tab to start building your fellowship."
        action={
          <GoldButton onClick={onGoToAdd}>
            <UserPlus className="h-4 w-4" /> Add a Friend
          </GoldButton>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Search by username…"
            aria-label="Search friends by username"
            className="royal-input w-full rounded-full py-2 pl-9 pr-4 text-sm outline-none focus:border-gold/40"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as FriendSortKey)}
            aria-label="Sort friends"
            className="royal-input rounded-full px-3 py-2 text-xs outline-none focus:border-gold/40"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <FilterChip active={onlineOnly} onClick={() => setOnlineOnly((v) => !v)}>
          Online
        </FilterChip>
        <FilterChip active={offlineOnly} onClick={() => setOfflineOnly((v) => !v)}>
          Offline
        </FilterChip>
        <FilterChip active={favoritesOnly} onClick={() => setFavoritesOnly((v) => !v)}>
          Favorites
        </FilterChip>
        {hasFilters && (
          <button
            onClick={() => {
              setSearch("");
              setOnlineOnly(false);
              setOfflineOnly(false);
              setFavoritesOnly(false);
            }}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground/70 hover:text-destructive"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "friend" : "friends"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No Search Results"
          subtitle="No friends match your search or filters. Try adjusting them."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((f, i) => (
              <FriendCard
                key={f.id}
                friend={f}
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                onRemove={onRemove}
                onOpenChallenge={onOpenChallenge}
                onOpenProfile={onOpenProfile}
                onTogglePin={onTogglePin}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
          {visibleCount < filtered.length && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="royal-chip rounded-full border px-5 py-2 text-sm text-muted-foreground hover:text-gold"
              >
                Load more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
        active
          ? "border-gold bg-gold/10 text-gold"
          : "border-white/10 text-muted-foreground hover:border-gold/30"
      }`}
    >
      {children}
    </button>
  );
}
