// Explore: search users & posts, browse by tag, leaderboards.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BadgeCheck, Search, Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { useCommunityFeed, useLeaderboard } from "@/hooks/useCommunity";
import { searchUsers } from "@/lib/api/communityClient";
import { FeedList } from "./community.index";

export const Route = createFileRoute("/community/explore")({
  head: () => ({ meta: [{ title: "Explore — Community — ChessOx" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    tag: typeof search.tag === "string" && search.tag ? search.tag : undefined,
  }),
  component: Explore,
});

const LEADERBOARDS = [
  { kind: "score", label: "Top Community Score" },
  { kind: "posts", label: "Top Posters" },
  { kind: "comments", label: "Top Commenters" },
  { kind: "followers", label: "Most Followed" },
] as const;

function LeaderboardCard({ kind, label }: { kind: (typeof LEADERBOARDS)[number]["kind"]; label: string }) {
  const { data = [] } = useLeaderboard(kind, 5);
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gold/80">
        <Trophy className="h-3.5 w-3.5" /> {label}
      </div>
      {data.map((u, i) => (
        <Link
          key={u.id}
          to="/u/$username"
          params={{ username: u.username }}
          className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-white/[0.04]"
        >
          <span className="w-4 text-center text-xs text-muted-foreground">{i + 1}</span>
          <UserAvatar avatarUrl={u.avatar_url} displayName={u.display_name} size="xs" />
          <span className="min-w-0 flex-1 truncate text-xs">{u.display_name}</span>
          <span className="text-xs text-gold">{u.metric}</span>
        </Link>
      ))}
      {data.length === 0 && <p className="text-xs text-muted-foreground">No data yet.</p>}
    </Card>
  );
}

function Explore() {
  const { q, tag } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [input, setInput] = useState(q ?? "");
  useEffect(() => setInput(q ?? ""), [q]);

  const searching = !!q || !!tag;
  const feed = useCommunityFeed({ mode: "trending", search: q, tag, enabled: searching });
  const trendingFeed = useCommunityFeed({ mode: "trending", enabled: !searching });
  const { data: users = [] } = useQuery({
    queryKey: ["community_user_search", q],
    queryFn: () => searchUsers(q!),
    enabled: !!q && q.length >= 2,
  });

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ search: { q: input.trim() || undefined, tag: undefined } });
        }}
        className="mb-4"
      >
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-4 py-2.5 focus-within:border-gold/40">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search posts, players, openings, tags…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </form>

      {tag && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Posts tagged</span>
          <span className="rounded-full border border-emerald/30 bg-emerald/10 px-3 py-0.5 text-emerald">#{tag}</span>
          <button
            type="button"
            onClick={() => navigate({ search: { q: undefined, tag: undefined } })}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            clear
          </button>
        </div>
      )}

      {users.length > 0 && (
        <Card className="mb-4 p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gold/80">Players</div>
          <div className="grid gap-1 sm:grid-cols-2">
            {users.map((u) => (
              <Link
                key={u.id}
                to="/u/$username"
                params={{ username: u.username }}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]"
              >
                <UserAvatar avatarUrl={u.avatar_url} displayName={u.display_name} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1 truncate text-xs font-medium">
                    {u.display_name}
                    {u.premium_tier && u.premium_tier !== "free" && (
                      <BadgeCheck className="h-3 w-3 text-gold" />
                    )}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    @{u.username} · {u.followers_count} followers
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {searching ? (
        <FeedList feed={feed} emptyText="No posts match your search." />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            {LEADERBOARDS.map((lb) => (
              <LeaderboardCard key={lb.kind} kind={lb.kind} label={lb.label} />
            ))}
          </div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-gold/80">
            Trending this week
          </h2>
          <FeedList feed={trendingFeed} emptyText="Nothing trending yet — start posting!" />
        </>
      )}
    </div>
  );
}
