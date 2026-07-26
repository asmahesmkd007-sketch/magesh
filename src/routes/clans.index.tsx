import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageShell } from "@/components/site/Primitives";
import { Search, Users, Shield, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMyClan } from "@/hooks/useMyClan";
import { listClans, redeemInviteLink, ClanApiError, type ClanSort } from "@/lib/clanApi";
import { ClanCard } from "@/components/clan/ClanCard";
import { ClanFormModal } from "@/components/clan/ClanFormModal";
import { toast } from "sonner";
import type { ClanSummary } from "@/types/clan";
import { seo, breadcrumbLd, collectionPageLd } from "@/lib/seo";

export const Route = createFileRoute("/clans/")({
  head: () =>
    seo({
      title: "Chess Clubs & Clans — Join a Chess Community | ChessOx",
      description:
        "Browse and join chess clubs on ChessOx. Find clans by global rank, member count or rating, team up with other chess players and compete together.",
      keywords: [
        "chess club online",
        "online chess community",
        "chess players community",
        "chess team",
        "chess community India",
      ],
      path: "/clans",
      jsonLd: [
        collectionPageLd({
          name: "Chess Clubs & Clans — ChessOx",
          description:
            "A directory of chess clubs (clans) on ChessOx, sortable by global rank, members, rating or newest, that players can join or create.",
          path: "/clans",
          about: ["Chess club", "Online chess community", "Chess players community"],
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Clubs", path: "/clans" },
        ]),
      ],
    }),
  component: ClansPage,
});

const PAGE_SIZE = 24;

const SORTS: { value: ClanSort; label: string }[] = [
  { value: "score", label: "Global Rank" },
  { value: "members", label: "Most Members" },
  { value: "rating", label: "Highest Rating" },
  { value: "newest", label: "Newest" },
];

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function ClansPage() {
  const { user } = useAuth();
  const { clanSlug, loading: myClanLoading } = useMyClan();
  const navigate = useNavigate();

  const [clans, setClans] = useState<ClanSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ClanSort>("score");
  const [showCreate, setShowCreate] = useState(false);
  const [inviteToken, setInviteToken] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const debouncedSearch = useDebounced(search);

  async function handleRedeemLink(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteToken.trim()) return;

    // Extract token if they pasted a full URL
    let token = inviteToken.trim();
    if (token.includes("/")) {
      const parts = token.split("/");
      token = parts[parts.length - 1];
    }

    setRedeeming(true);
    try {
      const slug = await redeemInviteLink(token);
      toast.success("Successfully joined the clan!");
      navigate({ to: "/clan/$slug", params: { slug } });
    } catch (err) {
      toast.error(err instanceof ClanApiError ? err.message : "Failed to redeem invite link");
    } finally {
      setRedeeming(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listClans({ search: debouncedSearch, sort, limit: PAGE_SIZE, offset: 0 })
      .then(({ clans: rows, total: t }) => {
        if (cancelled) return;
        setClans(rows);
        setTotal(t);
      })
      .catch(() => {
        if (!cancelled) {
          setClans([]);
          setTotal(0);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, sort]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const { clans: rows } = await listClans({
        search: debouncedSearch,
        sort,
        limit: PAGE_SIZE,
        offset: clans.length,
      });
      setClans((prev) => [...prev, ...rows]);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <PageShell>
      <div className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative z-10">
        <div>
          <h1 className="font-display text-5xl md:text-7xl font-black uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-gold via-white to-gold animate-gradient">
            Guilds & Clans
          </h1>
          <p className="text-xl text-muted-foreground mt-4 max-w-2xl font-light">
            Forge alliances, wage war, and dominate the global leaderboards. Find your brotherhood.
          </p>
        </div>
        <div className="flex gap-4">
          {!user ? (
            <Link
              to="/auth"
              className="px-8 py-4 bg-gold text-black font-display text-xl uppercase tracking-widest rounded-none border border-gold hover:bg-gold/80 hover:scale-105 transition-all shadow-[0_0_30px_rgba(212,175,55,0.3)]"
            >
              Sign In
            </Link>
          ) : myClanLoading ? (
            <div className="px-8 py-4 border border-white/10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : clanSlug ? (
            <Link
              to="/clan/$slug"
              params={{ slug: clanSlug }}
              className="flex items-center gap-2 px-8 py-4 bg-white/5 border border-white/10 text-white font-display text-xl uppercase tracking-widest rounded-none hover:bg-white/10 transition-all"
            >
              <Shield className="h-5 w-5 text-gold" /> My Clan
            </Link>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="px-8 py-4 bg-gold text-black font-display text-xl uppercase tracking-widest rounded-none border border-gold hover:bg-gold/80 hover:scale-105 transition-all shadow-[0_0_30px_rgba(212,175,55,0.3)]"
            >
              Create Clan
            </button>
          )}
        </div>
      </div>

      {!user ? null : (
        <div className="mb-8 p-4 md:p-6 rounded-2xl border border-white/10 bg-white/[0.02] max-w-2xl">
          <h3 className="font-display text-lg text-white mb-2">Have an Invite Link?</h3>
          <form onSubmit={handleRedeemLink} className="flex gap-2">
            <input
              type="text"
              placeholder="Paste invite link or token here..."
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-gold/50 transition-colors placeholder:text-white/20"
            />
            <button
              type="submit"
              disabled={!inviteToken.trim() || redeeming}
              className="px-6 py-2.5 bg-gold text-black font-semibold rounded-xl transition-colors hover:bg-gold/90 disabled:opacity-50"
            >
              {redeeming ? "Joining..." : "Join"}
            </button>
          </form>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-gold transition-colors" />
          <input
            type="text"
            placeholder="Search by clan name or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-none pl-12 pr-4 py-4 text-lg text-white focus:outline-none focus:border-gold/50 transition-colors placeholder:text-white/20"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as ClanSort)}
          className="px-6 border border-white/10 bg-black/40 text-white focus:outline-none focus:border-gold/50 transition-colors"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 bg-white/5 animate-pulse border border-white/5" />
          ))}
        </div>
      ) : clans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] p-16 text-center">
          <Users className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <div className="font-display text-lg text-white">No clans found</div>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {search ? "Try a different search." : "Be the first to found a clan."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clans.map((clan) => (
              <ClanCard key={clan.id} clan={clan} />
            ))}
          </div>
          {clans.length < total && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm text-white transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                {loadingMore ? "Loading..." : `Load More (${total - clans.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}

      {showCreate && (
        <ClanFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={(clan) => navigate({ to: "/clan/$slug", params: { slug: clan.slug } })}
        />
      )}
    </PageShell>
  );
}
