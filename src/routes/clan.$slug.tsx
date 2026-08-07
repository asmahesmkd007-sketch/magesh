import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Users,
  Calendar,
  ArrowLeft,
  MessageSquare,
  Shield,
  Settings as SettingsIcon,
  Award,
  LayoutDashboard,
  LogOut,
  DoorOpen,
  History,
  Ban,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  getClanBySlug,
  getClanMembers,
  getClanAwards,
  getMyPendingRequest,
  joinClan,
  cancelJoinRequest,
  leaveClan,
  ClanApiError,
} from "@/lib/clanApi";
import { gradientFromSlug } from "@/lib/clan";
import {
  ClanEmblem,
  MemberAvatar,
  RoleBadge,
  StatTile,
  PanelLoading,
  PanelEmpty,
} from "@/components/clan/ClanPrimitives";
import { MembersPanel } from "@/components/clan/MembersPanel";
import { ChatPanel } from "@/components/clan/ChatPanel";
import { WarsPanel } from "@/components/clan/WarsPanel";
import { SettingsPanel } from "@/components/clan/SettingsPanel";
import { ActivityPanel } from "@/components/clan/ActivityPanel";
import type { Clan, ClanAward, ClanMember, ClanRole } from "@/types/clan";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

import { RequireAuth } from "@/components/auth/RequireAuth";

export const Route = createFileRoute("/clan/$slug")({
  head: ({ params }) => {
    const path = `/clan/${params.slug}`;
    return seo({
      title: `${params.slug} — Chess Club on ChessOx`,
      description: `The ${params.slug} chess club on ChessOx: members, club chat, club wars and activity. Join the club to play and compete alongside other chess players.`,
      keywords: ["chess club online", "online chess community", "chess team"],
      path,
      jsonLd: [
        webPageLd({
          name: `${params.slug} — Chess Club on ChessOx`,
          description: `Profile page for the ${params.slug} chess club on ChessOx.`,
          path,
          primaryTopic: "Chess club",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Clubs", path: "/clans" },
          { name: params.slug, path },
        ]),
      ],
    });
  },
  component: () => (
    <RequireAuth>
      <ClanDashboard />
    </RequireAuth>
  ),
});

type Tab = "home" | "members" | "chat" | "wars" | "activity" | "settings";

const TABS: { id: Tab; label: string; icon: typeof Users; officerOnly?: boolean }[] = [
  { id: "home", label: "Home", icon: LayoutDashboard },
  { id: "members", label: "Members", icon: Users },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "wars", label: "Wars", icon: Shield },
  { id: "activity", label: "Activity", icon: History },
  { id: "settings", label: "Settings", icon: SettingsIcon, officerOnly: true },
];

function ClanDashboard() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [clan, setClan] = useState<Clan | null>(null);
  const [members, setMembers] = useState<ClanMember[]>([]);
  const [awards, setAwards] = useState<ClanAward[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<ClanRole | null>(null);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [activityKey, setActivityKey] = useState(0);
  const notFoundRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const clanData = await getClanBySlug(slug);
      if (!clanData) {
        notFoundRef.current = true;
        setClan(null);
        return;
      }
      notFoundRef.current = false;
      setClan(clanData);
      const [memberList, awardList] = await Promise.all([
        getClanMembers(clanData.id),
        getClanAwards(clanData.id),
      ]);
      setMembers(memberList);
      setAwards(awardList);
      const mine = user ? (memberList.find((m) => m.user_id === user.id)?.role ?? null) : null;
      setMyRole(mine);
      if (user && !mine) {
        setHasPendingRequest(await getMyPendingRequest(clanData.id, user.id));
      } else {
        setHasPendingRequest(false);
      }
    } catch (err) {
      toast.error(err instanceof ClanApiError ? err.message : "Failed to load clan");
      setClan(null);
    } finally {
      setLoading(false);
    }
  }, [slug, user]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Realtime: reflect joins/leaves/role changes/member count instantly for
  // everyone viewing this clan, without each visitor polling.
  useEffect(() => {
    if (!clan) return;
    const channel = supabase
      .channel(`clan_dashboard_${clan.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clan_members", filter: `clan_id=eq.${clan.id}` },
        () => {
          load();
          setActivityKey((k) => k + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "clans", filter: `id=eq.${clan.id}` },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clan?.id]);

  async function handleJoin() {
    if (!user) {
      toast.error("Sign in to join clans");
      return;
    }
    if (!clan) return;
    setBusy(true);
    try {
      const result = await joinClan(clan.id);
      toast.success(result === "joined" ? "Joined clan!" : "Join request sent!");
      await load();
    } catch (err) {
      toast.error(err instanceof ClanApiError ? err.message : "Could not join clan");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelRequest() {
    if (!clan) return;
    setBusy(true);
    try {
      await cancelJoinRequest(clan.id);
      toast.success("Join request cancelled");
      setHasPendingRequest(false);
    } catch (err) {
      toast.error(err instanceof ClanApiError ? err.message : "Could not cancel request");
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    if (!clan || !window.confirm(`Leave ${clan.name}?`)) return;
    setBusy(true);
    try {
      await leaveClan(clan.id);
      toast.success("Left clan");
      navigate({ to: "/clans" });
    } catch (err) {
      toast.error(err instanceof ClanApiError ? err.message : "Could not leave clan");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0D10]">
        <PanelLoading />
      </div>
    );
  }

  if (!clan) {
    return (
      <div className="mx-auto min-h-screen max-w-2xl bg-[#0B0D10] px-4 py-24">
        <PanelEmpty
          icon={Shield}
          title="Clan not found"
          hint="This clan does not exist or has been disbanded."
        />
        <div className="mt-6 text-center">
          <Link
            to="/clans"
            className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-gold/90"
          >
            <ArrowLeft className="h-4 w-4" /> Browse Clans
          </Link>
        </div>
      </div>
    );
  }

  const leader = members.find((m) => m.role === "leader");
  const coLeaders = members.filter((m) => m.role === "co_leader");
  const recentMembers = [...members]
    .sort((a, b) => b.joined_at.localeCompare(a.joined_at))
    .slice(0, 5);
  const isFull = clan.member_count >= clan.max_members;
  const leaderMustTransfer = myRole === "leader" && clan.member_count > 1;

  return (
    <div className="min-h-screen bg-[#0B0D10]">
      {/* Banner */}
      <div
        className={`relative h-56 md:h-72 ${!clan.banner_url ? `bg-gradient-to-br ${gradientFromSlug(slug)}` : "bg-cover bg-center"}`}
        style={clan.banner_url ? { backgroundImage: `url(${clan.banner_url})` } : undefined}
      >
        {!clan.banner_url && <div className="absolute inset-0 mandala-bg opacity-50" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D10] via-black/40 to-transparent" />
        <Link
          to="/clans"
          className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm transition-colors hover:text-gold md:left-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All Clans
        </Link>
      </div>

      <div className="mx-auto max-w-7xl px-4 md:px-8">
        {/* Header */}
        <div className="relative -mt-16 flex flex-wrap items-end gap-5 pb-6">
          <ClanEmblem
            name={clan.name}
            slug={slug}
            logoUrl={clan.logo_url}
            className="h-28 w-28 rounded-2xl text-4xl ring-4 ring-[#0B0D10]"
          />
          <div className="min-w-[220px] flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl text-white md:text-4xl">{clan.name}</h1>
              <span className="rounded bg-gold/20 px-2 py-0.5 font-mono text-sm font-bold text-gold">
                [{clan.tag}]
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-muted-foreground">
                Global Rank #{clan.global_rank}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className={`flex items-center gap-1 ${isFull ? "text-destructive" : ""}`}>
                <Users className="h-4 w-4" /> {clan.member_count} / {clan.max_members} members
                {isFull ? " (Full)" : ""}
              </span>
              <span>🌍 {clan.country}</span>
              <span>🗣️ {clan.language}</span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" /> Founded{" "}
                {new Date(clan.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              myRole ? (
                leaderMustTransfer ? (
                  <button
                    onClick={() => setTab("members")}
                    className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold"
                    title="Transfer leadership to another member before leaving"
                  >
                    <LogOut className="h-4 w-4" /> Transfer Leadership to Leave
                  </button>
                ) : (
                  <button
                    onClick={handleLeave}
                    disabled={busy}
                    className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                  >
                    <LogOut className="h-4 w-4" /> {busy ? "Leaving..." : "Leave Clan"}
                  </button>
                )
              ) : hasPendingRequest ? (
                <button
                  onClick={handleCancelRequest}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                >
                  <Ban className="h-4 w-4" /> {busy ? "Cancelling..." : "Cancel Request"}
                </button>
              ) : clan.privacy !== "invite_only" ? (
                <button
                  onClick={handleJoin}
                  disabled={busy || isFull}
                  className="flex items-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-black shadow-[0_0_15px_rgba(212,175,55,0.3)] transition-colors hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <DoorOpen className="h-4 w-4" />
                  {isFull
                    ? "Clan Full"
                    : busy
                      ? "Requesting..."
                      : clan.privacy === "private"
                        ? "Request to Join"
                        : "Join Clan"}
                </button>
              ) : (
                <span className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground">
                  <Ban className="h-4 w-4" /> Invite Only
                </span>
              )
            ) : (
              <Link
                to="/auth"
                className="flex items-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-gold/90"
              >
                <Users className="h-4 w-4" /> Sign in to Join
              </Link>
            )}
          </div>
        </div>

        {hasPendingRequest ? (
          <div className="mt-12 rounded-2xl border border-white/5 bg-black/20 p-12 text-center">
            <Ban className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
            <h3 className="font-display text-2xl text-white">Join Request Pending</h3>
            <p className="mt-2 text-muted-foreground">
              Your request is awaiting officer approval. You will gain access to the clan lobby once
              accepted.
            </p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="custom-scrollbar mb-6 flex gap-1 overflow-x-auto border-b border-white/5 pb-px">
              {TABS.map(({ id, label, icon: Icon, officerOnly }) => {
                if (officerOnly && myRole !== "leader" && myRole !== "co_leader") return null;
                const active = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "border-gold text-gold"
                        : "border-transparent text-muted-foreground hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div className="min-h-[420px] pb-16">
              {tab === "home" && (
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="space-y-6 lg:col-span-2">
                    <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                      <h3 className="font-display text-lg text-white">About</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {clan.description || "No description provided."}
                      </p>
                      <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/5 pt-6 sm:grid-cols-4">
                        <StatTile
                          label="Rating"
                          value={clan.clan_rating}
                          accent="text-gradient-gold"
                        />
                        <StatTile label="Score" value={clan.clan_score} />
                        <StatTile
                          label="War Wins"
                          value={clan.war_wins}
                          accent="text-emerald-500"
                        />
                        <StatTile label="Total Wars" value={clan.total_wars} />
                      </div>
                    </section>

                    <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                      <h3 className="flex items-center gap-2 font-display text-lg text-white">
                        <Award className="h-5 w-5 text-gold" /> Awards
                      </h3>
                      {awards.length === 0 ? (
                        <p className="mt-3 text-sm text-muted-foreground">
                          No awards earned yet — win wars to fill the trophy case.
                        </p>
                      ) : (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {awards.map((a) => (
                            <div
                              key={a.id}
                              className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/20 p-3"
                            >
                              <Award className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
                              <div>
                                <div className="text-sm font-medium text-white">{a.title}</div>
                                {a.description && (
                                  <div className="mt-0.5 text-xs text-muted-foreground">
                                    {a.description}
                                  </div>
                                )}
                                <div className="mt-1 text-[10px] text-muted-foreground/70">
                                  {new Date(a.awarded_at).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>

                  <div className="space-y-6">
                    <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                      <h3 className="font-display text-lg text-white">Leadership</h3>
                      <div className="mt-4 space-y-4">
                        {leader ? (
                          <LeaderRow member={leader} />
                        ) : (
                          <p className="text-sm text-muted-foreground">No leader data.</p>
                        )}
                        {coLeaders.map((m) => (
                          <LeaderRow key={m.id} member={m} />
                        ))}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                      <h3 className="font-display text-lg text-white">Recent Members</h3>
                      <div className="mt-4 space-y-3">
                        {recentMembers.map((m) => (
                          <div key={m.id} className="flex items-center gap-3">
                            <MemberAvatar
                              username={m.profiles?.username}
                              avatarUrl={m.profiles?.avatar_url}
                              className="h-8 w-8 text-xs"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm text-white">
                                {m.profiles?.username ?? "Unknown"}
                              </div>
                            </div>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {new Date(m.joined_at).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setTab("members")}
                        className="mt-4 text-xs font-semibold text-gold transition-colors hover:text-gold/70"
                      >
                        View all members →
                      </button>
                    </section>
                  </div>
                </div>
              )}

              {tab === "members" && (
                <MembersPanel members={members} myRole={myRole} clanId={clan.id} onChanged={load} />
              )}
              {tab === "chat" && <ChatPanel clanId={clan.id} myRole={myRole} />}
              {tab === "wars" && (
                <WarsPanel
                  clanId={clan.id}
                  myRole={myRole}
                  onChanged={() => setActivityKey((k) => k + 1)}
                />
              )}
              {tab === "activity" && <ActivityPanel clanId={clan.id} refreshKey={activityKey} />}
              {tab === "settings" && <SettingsPanel clan={clan} myRole={myRole} onChanged={load} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LeaderRow({ member }: { member: ClanMember }) {
  return (
    <div className="flex items-center gap-3">
      <MemberAvatar username={member.profiles?.username} avatarUrl={member.profiles?.avatar_url} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">
          {member.profiles?.username ?? "Unknown"}
        </div>
        <div className="mt-1">
          <RoleBadge role={member.role} />
        </div>
      </div>
    </div>
  );
}
