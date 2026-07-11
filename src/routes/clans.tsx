import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Card, SectionTitle, GoldButton } from "@/components/site/Primitives";
import { Users, Search, Loader2, Plus, Shield, Trophy } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CreateClanModal } from "@/components/clan/CreateClanModal";

export const Route = createFileRoute("/clans")({
  head: () => ({ meta: [{ title: "Clans — ChessOx" }] }),
  component: Clans,
});

type Clan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  member_count?: number;
  cover_gradient?: string | null;
  created_at?: string;
};

const GRADIENTS = [
  "from-amber-500 to-rose-700",
  "from-emerald-500 to-teal-700",
  "from-violet-500 to-indigo-700",
  "from-sky-500 to-blue-700",
  "from-pink-500 to-purple-700",
  "from-orange-500 to-amber-700",
];

function Clans() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clans, setClans] = useState<Clan[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [joining, setJoining] = useState<string | null>(null);
  const [myClans, setMyClans] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    setLoading(true);
    // Fetch from clan_leaderboard to get member_count
    supabase
      .from("clan_leaderboard")
      .select("id,slug,name,member_count,description,cover_gradient")
      .order("member_count", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setClans((data ?? []) as Clan[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Check if user is already in a clan, and redirect immediately if so
    supabase
      .from("clan_members")
      .select("clan_id")
      .eq("user_id", user.id)
      .then(async ({ data }) => {
        if (data && data.length > 0) {
          const clanId = data[0].clan_id;
          const { data: clanData } = await supabase.from("clans").select("slug").eq("id", clanId).single();
          if (clanData) {
            navigate({ to: "/clan/$slug", params: { slug: clanData.slug }, replace: true });
          } else {
            setMyClans(new Set([clanId]));
          }
        }
      });
  }, [user, navigate]);

  async function joinClan(clanId: string) {
    if (!user) {
      toast.error("Sign in to join clans");
      return;
    }
    if (myClans.size > 0) {
      toast.error("You are already in a clan. Leave it first to join a new one.");
      return;
    }
    setJoining(clanId);
    
    const { error } = await supabase.rpc("clan_request_join", { p_clan_id: clanId });
    
    if (!error) {
      setMyClans((prev) => new Set([...prev, clanId]));
      setClans((prev) =>
        prev.map((c) => (c.id === clanId ? { ...c, member_count: (c.member_count ?? 0) + 1 } : c)),
      );
      toast.success("Joined clan!");
    } else {
      toast.error(error.message || "Could not join clan");
    }
    setJoining(null);
  }

  async function leaveClan(clanId: string) {
    if (!user) return;
    await supabase.from("clan_members").delete().eq("clan_id", clanId).eq("user_id", user.id);
    setMyClans((prev) => {
      const s = new Set(prev);
      s.delete(clanId);
      return s;
    });
    setClans((prev) =>
      prev.map((c) =>
        c.id === clanId ? { ...c, member_count: Math.max(0, (c.member_count ?? 1) - 1) } : c,
      ),
    );
    toast.success("Left clan");
  }

  const filtered = clans.filter(
    (c) =>
      !query ||
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      (c.description ?? "").toLowerCase().includes(query.toLowerCase()),
  );

  const featured = filtered.slice(0, 3);
  const directory = filtered.slice(3);

  const searchInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-screen bg-[#0B0D10]">
      {/* Full Bleed Hero Background */}
      <div 
        className="relative min-h-[70vh] flex flex-col items-center justify-center p-6 bg-cover bg-center border-b border-white/5"
        style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1605374523351-689360563b71?auto=format&fit=crop&q=80&w=2000")' }}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
        
        <div className="absolute top-10 left-10 flex items-center gap-3 z-10">
          <Shield className="h-7 w-7 text-gold" />
          <h2 className="font-display text-2xl tracking-widest font-bold uppercase text-white">Clan War</h2>
        </div>

        {/* Center Glass Panel */}
        <div className="relative z-10 w-full max-w-3xl rounded-3xl border border-white/10 bg-black/40 backdrop-blur-md px-8 py-14 text-center shadow-2xl">
          <Shield className="mx-auto h-20 w-20 text-gold mb-6" />
          <h1 className="font-display text-4xl md:text-5xl mb-4 text-white">No Clan Yet</h1>
          <p className="text-white/70 text-lg mb-10 max-w-md mx-auto">
            Create your own clan or join an existing one to participate in epic Clan Wars.
          </p>
          
          <div className="flex flex-wrap items-center justify-center gap-4">
            {myClans.size > 0 ? (
              <Link to="/clan/$slug" params={{ slug: clans.find(c => myClans.has(c.id))?.slug || "unknown" }}>
                <GoldButton className="px-8 py-3 text-sm font-bold shadow-[0_0_15px_rgba(212,175,55,0.4)]">
                  <Shield className="mr-2 h-4 w-4" /> View My Clan
                </GoldButton>
              </Link>
            ) : (
              <GoldButton onClick={() => {
                if (!user) toast.error("Sign in to create a clan");
                else setShowCreateModal(true);
              }} className="px-8 py-3 text-sm font-bold shadow-[0_0_15px_rgba(212,175,55,0.4)]">
                <Plus className="mr-2 h-4 w-4" /> Create Clan
              </GoldButton>
            )}
            <button 
              onClick={() => searchInputRef.current?.focus()}
              className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-6 py-3 text-sm font-medium hover:bg-white/10 transition-colors text-white backdrop-blur-sm"
            >
              <Search className="h-4 w-4 text-muted-foreground" /> Find a Clan
            </button>
            <button className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-6 py-3 text-sm font-medium hover:bg-white/10 transition-colors text-white backdrop-blur-sm">
              <Trophy className="h-4 w-4 text-muted-foreground" /> Leaderboard
            </button>
          </div>
        </div>
      </div>
      
      {/* Directory Section */}
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-8">
      <Card className="mb-8 flex items-center gap-3 p-3 max-w-3xl mx-auto border-white/5 bg-white/[0.02]">
        <Search className="ml-2 h-5 w-5 text-muted-foreground" />
        <input
          ref={searchInputRef}
          className="flex-1 bg-transparent px-2 py-1.5 text-base outline-none text-white placeholder:text-muted-foreground"
          placeholder="Search clans by name, city or region..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {user && (
          <div className="flex items-center gap-2">
            {myClans.size > 0 ? (
              <button 
                onClick={() => leaveClan(Array.from(myClans)[0])}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-white/20 text-muted-foreground hover:border-destructive/40 hover:text-destructive transition-colors"
              >
                Leave Clan
              </button>
            ) : (
              <GoldButton onClick={() => setShowCreateModal(true)} className="px-4 py-2 text-sm font-medium">
                <Plus className="mr-1 h-4 w-4" /> Create Clan
              </GoldButton>
            )}
          </div>
        )}
      </Card>
      
      {showCreateModal && (
        <CreateClanModal 
          onClose={() => setShowCreateModal(false)} 
          onSuccess={(newClan) => {
            const clanWithCount = { ...newClan, member_count: 1 };
            setClans(prev => [clanWithCount, ...prev]);
            setMyClans(prev => new Set([...prev, newClan.id]));
            navigate({ to: "/clan/$slug", params: { slug: newClan.slug } });
          }} 
        />
      )}

      {loading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No clans found. Create the first one!
        </Card>
      ) : (
        <>
          <SectionTitle kicker="Featured" title="Royal courts" />
          <div className="grid gap-4 md:grid-cols-3">
            {featured.map((c, i) => (
              <Link to="/clan/$slug" params={{ slug: c.slug }} key={c.id}>
                <Card className="overflow-hidden transition-transform hover:-translate-y-1">
                  <div
                    className={`relative h-32 bg-gradient-to-br ${c.cover_gradient ?? GRADIENTS[i % GRADIENTS.length]}`}
                  >
                    <div className="absolute inset-0 mandala-bg opacity-50" />
                    <div className="absolute inset-0 grid place-items-center font-display text-5xl text-black/30">
                      ♛
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="font-display text-xl">{c.name}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{c.description ? c.description.slice(0, 30) : ""}</span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {c.member_count ?? 0}
                      </span>
                    </div>
                    <div className="mt-3">
                      {myClans.has(c.id) ? (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            leaveClan(c.id);
                          }}
                          className="rounded-full border border-white/20 px-3 py-1 text-xs text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                        >
                          Leave
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            joinClan(c.id);
                          }}
                          disabled={joining === c.id}
                          className="rounded-full border border-gold/30 px-3 py-1 text-xs text-gold hover:bg-gold/10"
                        >
                          {joining === c.id ? "Joining…" : "Join"}
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {directory.length > 0 && (
            <>
              <SectionTitle kicker="Directory" title="All clans" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {directory.map((c) => (
                  <Card
                    key={c.id}
                    className="flex items-center justify-between p-4 hover:border-gold/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg gradient-gold text-[#0B0D10] font-display">
                        {c.name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-display">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.member_count ?? 0} members
                        </div>
                      </div>
                    </div>
                    {myClans.has(c.id) ? (
                      <button
                        onClick={() => leaveClan(c.id)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Leave
                      </button>
                    ) : (
                      <button
                        onClick={() => joinClan(c.id)}
                        disabled={joining === c.id}
                        className="text-xs text-gold hover:text-gold/70"
                      >
                        {joining === c.id ? "…" : "Join"}
                      </button>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
      </div>
    </div>
  );
}
