import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageShell, Card, GoldButton, SectionTitle } from "@/components/site/Primitives";
import { Users, Trophy, Calendar, ArrowLeft, Loader2, Crown, MessageSquare, Shield, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { ClanMembersTab } from "@/components/clan/ClanMembersTab";
import { ClanChatTab } from "@/components/clan/ClanChatTab";
import { ClanSettingsTab } from "@/components/clan/ClanSettingsTab";
import { ClanWarsTab } from "@/components/clan/ClanWarsTab";

export const Route = createFileRoute("/clan/$slug")({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} — ChessOx Clan` }] }),
  component: ClanPage,
});

type Clan = {
  id: string;
  slug: string;
  name: string;
  tag: string;
  description: string | null;
  banner_url: string | null;
  logo_url: string | null;
  country: string;
  language: string;
  privacy: "public" | "private" | "invite_only";
  member_count: number;
  clan_rating: number;
  clan_score: number;
  war_wins: number;
  total_wars: number;
  created_at: string;
};

type Member = {
  id: string;
  user_id: string;
  role: "leader" | "co_leader" | "member";
  joined_at: string;
  profiles: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    premium_active?: boolean;
    premium_expires_at?: string | null;
  } | null;
};

const GRADIENTS = [
  "from-amber-500/40 via-rose-700/40 to-orange-700/40",
  "from-emerald-500/40 via-teal-700/40 to-cyan-700/40",
  "from-violet-500/40 via-purple-700/40 to-indigo-700/40",
  "from-sky-500/40 via-blue-700/40 to-indigo-700/40",
  "from-pink-500/40 via-fuchsia-700/40 to-purple-700/40",
];

function gradientFromSlug(slug: string) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

type Tab = "overview" | "members" | "chat" | "wars" | "settings";

function ClanPage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clan, setClan] = useState<Clan | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<"leader" | "co_leader" | "member" | null>(null);
  const [joining, setJoining] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  useEffect(() => {
    async function load() {
      setLoading(true);
      
      // Load clan data from the main table, member count from leaderboard view
      const { data: clanData } = await supabase
        .from("clans")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (!clanData) {
        setLoading(false);
        return;
      }
      
      // Fetch member count
      const { data: countData } = await supabase
        .from("clan_leaderboard")
        .select("member_count")
        .eq("id", clanData.id)
        .maybeSingle();
        
      setClan({ ...clanData, member_count: countData?.member_count ?? 1 } as Clan);

      // Load members
      const { data: m } = await supabase
        .from("clan_members")
        .select("id,user_id,role,joined_at,profiles(username,full_name,avatar_url,premium_active,premium_expires_at)")
        .eq("clan_id", clanData.id)
        .order("role", { ascending: false }) // sort leader first, then member
        .limit(40);

      setMembers((m ?? []) as unknown as Member[]);

      if (user) {
        const me = m?.find(member => member.user_id === user.id);
        if (me) {
          setMyRole(me.role as any);
        } else {
          setMyRole(null);
        }
      }
      setLoading(false);
    }
    load();
  }, [slug, user]);

  async function joinClan() {
    if (!user) {
      toast.error("Sign in to join clans");
      return;
    }
    if (!clan) return;
    setJoining(true);
    
    const { error } = await supabase.rpc("clan_request_join", { p_clan_id: clan.id });
    
    if (!error) {
      if (clan.privacy === "public") {
        setMyRole("member");
        setClan((c) => (c ? { ...c, member_count: c.member_count + 1 } : c));
        toast.success("Joined clan!");
      } else {
        toast.success("Join request sent!");
      }
    } else {
      toast.error(error.message || "Could not join clan");
    }
    setJoining(false);
  }

  async function leaveClan() {
    if (!user || !clan || !myRole) return;
    if (myRole === "leader" && clan.member_count > 1) {
      toast.error("You must transfer leadership or remove all members before leaving.");
      return;
    }
    
    await supabase.from("clan_members").delete().eq("clan_id", clan.id).eq("user_id", user.id);
    setMyRole(null);
    setClan((c) => (c ? { ...c, member_count: Math.max(0, c.member_count - 1) } : c));
    toast.success("Left clan");
    
    if (myRole === "leader" && clan.member_count <= 1) {
      // If leader was the last member, the clan might be orphaned or deleted via triggers.
      navigate({ to: "/clans" });
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div className="grid place-items-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </PageShell>
    );
  }

  if (!clan) {
    return (
      <PageShell eyebrow="Not Found" title="Clan not found">
        <Card className="p-10 text-center">
          <p className="text-muted-foreground">This clan does not exist or has been disbanded.</p>
          <div className="mt-4">
            <Link to="/clans">
              <GoldButton>
                <ArrowLeft className="h-4 w-4" /> Browse Clans
              </GoldButton>
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  const bg = clan.banner_url ? `url(${clan.banner_url}) center/cover` : "";
  const fallbackGradient = `bg-gradient-to-br ${gradientFromSlug(slug)}`;

  return (
    <PageShell>
      <button
        onClick={() => navigate({ to: "/clans" })}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" /> All Clans
      </button>

      {/* Hero Section */}
      <Card className="overflow-hidden mb-6">
        <div 
          className={`relative h-48 md:h-64 ${!clan.banner_url ? fallbackGradient : ""}`}
          style={clan.banner_url ? { background: bg } : undefined}
        >
          {!clan.banner_url && <div className="absolute inset-0 mandala-bg opacity-60" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        </div>
        <div className="relative -mt-16 p-6 md:p-8">
          <div className="flex flex-wrap items-end gap-5">
            {clan.logo_url ? (
              <img src={clan.logo_url} alt={clan.name} className="h-28 w-28 rounded-2xl object-cover ring-4 ring-background bg-black" />
            ) : (
              <div className="grid h-28 w-28 place-items-center rounded-2xl gradient-gold font-display text-4xl text-[#0B0D10] ring-4 ring-background">
                {clan.name[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-3">
                <h1 className="font-display text-4xl">{clan.name}</h1>
                <span className="rounded bg-gold/20 px-2 py-0.5 font-mono text-sm font-bold text-gold">
                  [{clan.tag}]
                </span>
              </div>
              <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {clan.member_count} members</span>
                <span>🌍 {clan.country}</span>
                <span>🗣️ {clan.language}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {user ? (
                myRole ? (
                  <button
                    onClick={leaveClan}
                    className="rounded-xl border border-white/20 px-4 py-2 text-sm text-muted-foreground hover:border-destructive/40 hover:text-destructive transition-colors"
                  >
                    Leave Clan
                  </button>
                ) : (
                  clan.privacy !== "invite_only" && (
                    <GoldButton onClick={joinClan} disabled={joining}>
                      <Shield className="h-4 w-4" /> 
                      {joining ? "Requesting..." : clan.privacy === "private" ? "Request to Join" : "Join Clan"}
                    </GoldButton>
                  )
                )
              ) : (
                <Link to="/auth">
                  <GoldButton>
                    <Users className="h-4 w-4" /> Sign in to Join
                  </GoldButton>
                </Link>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/5 mb-6 overflow-x-auto custom-scrollbar pb-1">
        {[
          { id: "overview", label: "Overview", icon: Trophy },
          { id: "members", label: "Members", icon: Users },
          { id: "chat", label: "Clan Chat", icon: MessageSquare },
          { id: "wars", label: "Clan Wars", icon: Shield },
          { id: "settings", label: "Settings", icon: SettingsIcon, restricted: true },
        ].map(tab => {
          if (tab.restricted && myRole !== "leader" && myRole !== "co_leader") return null;
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                active ? "border-gold text-gold" : "border-transparent text-muted-foreground hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "overview" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2 space-y-6">
              <div>
                <SectionTitle kicker="About" title="Description" />
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {clan.description || "No description provided."}
                </p>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-white/5">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">Clan Rating</div>
                  <div className="mt-1 font-display text-2xl text-gradient-gold">{clan.clan_rating}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">Score</div>
                  <div className="mt-1 font-display text-2xl text-white">{clan.clan_score}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">War Wins</div>
                  <div className="mt-1 font-display text-2xl text-emerald-500">{clan.war_wins}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">Total Wars</div>
                  <div className="mt-1 font-display text-2xl">{clan.total_wars}</div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <SectionTitle kicker="Leadership" title="Commanders" />
              <div className="space-y-4">
                {members.filter(m => m.role === 'leader' || m.role === 'co_leader').map(m => (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-gold/10 font-display text-gold">
                      {m.profiles?.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{m.profiles?.username}</div>
                      <div className="text-xs text-gold capitalize flex items-center gap-1 mt-0.5">
                        <Crown className="h-3 w-3" /> {m.role.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {activeTab === "members" && (
          <ClanMembersTab 
            members={members} 
            myRole={myRole} 
            clanId={clan.id} 
            onMembersUpdated={() => {
              // Reload members logic can go here, or we can just trigger a re-render.
              // A simple window.location.reload() or re-running the load function is ideal.
              window.location.reload();
            }} 
          />
        )}

        {activeTab === "chat" && (
          <ClanChatTab clanId={clan.id} myRole={myRole} />
        )}

        {activeTab === "wars" && (
          <ClanWarsTab clanId={clan.id} myRole={myRole} />
        )}
        
        {activeTab === "settings" && (
          <ClanSettingsTab clanId={clan.id} myRole={myRole} />
        )}
      </div>
    </PageShell>
  );
}
