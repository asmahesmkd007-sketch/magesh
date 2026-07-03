import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { PageShell, Card, GoldButton, SectionTitle } from "@/components/site/Primitives";
import { Users, Trophy, Calendar, ArrowLeft, Loader2, Crown } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { PremiumBadge } from "@/components/site/PremiumBadge";

export const Route = createFileRoute("/club/$slug")({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} — ChessOx Club` }] }),
  component: ClubPage,
});

type Club = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  banner_url: string | null;
  member_count: number | null;
  cover_gradient: string | null;
  owner_id: string;
  created_at: string;
};

type Member = {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles: {
    username: string;
    display_name: string | null;
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

function ClubPage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: c } = await supabase
        .from("clubs")
        .select(
          "id,slug,name,description,banner_url,member_count,cover_gradient,owner_id,created_at",
        )
        .eq("slug", slug)
        .maybeSingle();

      if (!c) {
        setLoading(false);
        return;
      }
      setClub(c as Club);

      const { data: m } = await supabase
        .from("club_members")
        .select(
          "id,user_id,role,joined_at,profiles(username,display_name,premium_active,premium_expires_at)",
        )
        .eq("club_id", (c as Club).id)
        .order("joined_at", { ascending: true })
        .limit(40);

      setMembers((m ?? []) as unknown as Member[]);

      if (user) {
        const { data: me } = await supabase
          .from("club_members")
          .select("id")
          .eq("club_id", (c as Club).id)
          .eq("user_id", user.id)
          .maybeSingle();
        setIsMember(!!me);
      }
      setLoading(false);
    }
    load();
  }, [slug, user]);

  async function joinClub() {
    if (!user) {
      toast.error("Sign in to join clubs");
      return;
    }
    if (!club) return;
    setJoining(true);
    const { error } = await supabase
      .from("club_members")
      .insert({ club_id: club.id, user_id: user.id } as never);
    if (!error) {
      setIsMember(true);
      setClub((c) => (c ? { ...c, member_count: (c.member_count ?? 0) + 1 } : c));
      toast.success("Joined club!");
    } else {
      toast.error("Could not join club");
    }
    setJoining(false);
  }

  async function leaveClub() {
    if (!user || !club) return;
    await supabase.from("club_members").delete().eq("club_id", club.id).eq("user_id", user.id);
    setIsMember(false);
    setClub((c) => (c ? { ...c, member_count: Math.max(0, (c.member_count ?? 1) - 1) } : c));
    toast.success("Left club");
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

  if (!club) {
    return (
      <PageShell eyebrow="Not Found" title="Club not found">
        <Card className="p-10 text-center">
          <p className="text-muted-foreground">This club does not exist or has been disbanded.</p>
          <div className="mt-4">
            <Link to="/clubs">
              <GoldButton>
                <ArrowLeft className="h-4 w-4" /> Browse Clubs
              </GoldButton>
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  const bg = club.cover_gradient
    ? `bg-gradient-to-br ${club.cover_gradient}`
    : `bg-gradient-to-br ${gradientFromSlug(slug)}`;

  return (
    <PageShell>
      <button
        onClick={() => navigate({ to: "/clubs" })}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" /> All Clubs
      </button>

      <Card className="overflow-hidden">
        <div className={`relative h-48 ${bg} md:h-64`}>
          <div className="absolute inset-0 mandala-bg opacity-60" />
        </div>
        <div className="relative -mt-12 p-6 md:p-8">
          <div className="flex flex-wrap items-end gap-5">
            <div className="grid h-24 w-24 place-items-center rounded-2xl gradient-gold font-display text-3xl text-[#0B0D10] ring-4 ring-background">
              {club.name[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <h1 className="font-display text-4xl">{club.name}</h1>
              <div className="mt-1 text-sm text-muted-foreground">
                {club.description
                  ? club.description
                  : `Founded ${new Date(club.created_at).getFullYear()}`}{" "}
                · {club.member_count ?? 0} members
              </div>
            </div>
            {user ? (
              isMember ? (
                <button
                  onClick={leaveClub}
                  className="rounded-xl border border-white/20 px-4 py-2 text-sm text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                >
                  Leave Club
                </button>
              ) : (
                <GoldButton onClick={joinClub} disabled={joining}>
                  <Users className="h-4 w-4" /> {joining ? "Joining…" : "Join Club"}
                </GoldButton>
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
      </Card>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Members */}
        <Card className="p-6">
          <SectionTitle kicker="Court" title="Members" />
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <div className="space-y-3">
              {members.slice(0, 12).map((m) => {
                const name = m.profiles?.display_name || m.profiles?.username || "Member";
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-gold/10 font-display text-sm text-gold">
                      {name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate flex items-center">
                        {name}
                        <PremiumBadge
                          premiumActive={m.profiles?.premium_active}
                          premiumExpiresAt={m.profiles?.premium_expires_at}
                        />
                      </div>
                      {m.role !== "member" && (
                        <div className="text-[10px] uppercase tracking-widest text-gold/70 flex items-center gap-1">
                          <Crown className="h-3 w-3" /> {m.role}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {members.length > 12 && (
                <p className="text-xs text-muted-foreground pt-1">
                  +{members.length - 12} more members
                </p>
              )}
            </div>
          )}
        </Card>

        {/* About / Stats */}
        <Card className="p-6 lg:col-span-2">
          <SectionTitle kicker="Kingdom" title="About this club" />
          <div className="space-y-4">
            {club.description ? (
              <p className="text-sm text-muted-foreground leading-relaxed">{club.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No description yet.</p>
            )}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest">
                  Members
                </div>
                <div className="mt-1 font-display text-2xl text-gradient-gold">
                  {club.member_count ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest">
                  Founded
                </div>
                <div className="mt-1 font-display text-2xl">
                  {new Date(club.created_at).getFullYear()}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gold/15 bg-gold/5 p-4 mt-4">
              <div className="flex items-center gap-2 text-sm text-gold">
                <Trophy className="h-4 w-4" />
                <span className="font-display">Club battles coming soon</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Challenge other clubs to team matches, clan wars, and more.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
