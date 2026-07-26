import { useMemo, useState } from "react";
import { MoreVertical, Search, Shield, ShieldOff, UserX, Crown, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { MemberAvatar, RoleBadge, PanelEmpty } from "@/components/clan/ClanPrimitives";
import {
  promoteMember,
  demoteMember,
  kickMember,
  transferLeadership,
  ClanApiError,
} from "@/lib/clanApi";
import type { ClanMember, ClanRole } from "@/types/clan";

type SortKey = "role" | "newest" | "oldest" | "name";
type MemberAction = "promote" | "demote" | "kick" | "transfer";

const ROLE_ORDER: Record<ClanRole, number> = { leader: 0, co_leader: 1, member: 2 };

const ACTIONS: Record<
  MemberAction,
  { run: (clanId: string, userId: string) => Promise<void>; success: string }
> = {
  promote: { run: promoteMember, success: "Member promoted to Co-Leader" },
  demote: { run: demoteMember, success: "Co-Leader demoted to Member" },
  kick: { run: kickMember, success: "Member removed from clan" },
  transfer: { run: transferLeadership, success: "Leadership transferred" },
};

interface Props {
  members: ClanMember[];
  myRole: ClanRole | null;
  clanId: string;
  onChanged: () => void | Promise<void>;
}

export function MembersPanel({ members, myRole, clanId, onChanged }: Props) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("role");
  const [busy, setBusy] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? members.filter(
          (m) =>
            (m.profiles?.username ?? "").toLowerCase().includes(q) ||
            (m.profiles?.full_name ?? "").toLowerCase().includes(q),
        )
      : members;
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "newest":
          return b.joined_at.localeCompare(a.joined_at);
        case "oldest":
          return a.joined_at.localeCompare(b.joined_at);
        case "name":
          return (a.profiles?.username ?? "").localeCompare(b.profiles?.username ?? "");
        default:
          // Spec order: role rank, then war points, then rating, then join date.
          return (
            ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
            b.war_points - a.war_points ||
            (b.profiles?.iq_level ?? 0) - (a.profiles?.iq_level ?? 0) ||
            a.joined_at.localeCompare(b.joined_at)
          );
      }
    });
  }, [members, query, sort]);

  async function runAction(member: ClanMember, action: MemberAction) {
    if (
      action === "transfer" &&
      !window.confirm(
        `Transfer leadership to ${member.profiles?.username}? You will become a Co-Leader.`,
      )
    ) {
      return;
    }
    setBusy(member.id);
    setMenuOpen(null);
    try {
      await ACTIONS[action].run(clanId, member.user_id);
      toast.success(ACTIONS[action].success);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof ClanApiError ? err.message : `Failed to ${action}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-muted-foreground"
            placeholder="Search members..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-gold/50"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="role">Sort: Rank</option>
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <PanelEmpty
          icon={Users}
          title="No members found"
          hint={query ? "Try a different search." : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => {
            const isMe = m.user_id === user?.id;
            const canManage =
              !isMe && (myRole === "leader" || (myRole === "co_leader" && m.role === "member"));
            return (
              <div
                key={m.id}
                className="relative flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3.5 transition-colors hover:border-white/15"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative shrink-0">
                    <MemberAvatar
                      username={m.profiles?.username}
                      avatarUrl={m.profiles?.avatar_url}
                    />
                    {m.profiles?.is_online && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0B0D10] bg-emerald-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate text-sm font-medium text-white">
                      {m.profiles?.username ?? "Unknown"}
                      <PremiumBadge
                        premiumActive={m.profiles?.premium_active}
                        premiumExpiresAt={m.profiles?.premium_expires_at}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <RoleBadge role={m.role} />
                      {m.profiles?.iq_level != null && (
                        <span className="text-[10px] text-muted-foreground">
                          IQ {m.profiles.iq_level}
                        </span>
                      )}
                      {m.war_points > 0 && (
                        <span className="text-[10px] text-gold">{m.war_points} WP</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(m.joined_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {canManage && (
                  <div>
                    <button
                      onClick={() => setMenuOpen(menuOpen === m.id ? null : m.id)}
                      disabled={busy === m.id}
                      className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {menuOpen === m.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                        <div className="absolute right-2 top-12 z-50 w-52 rounded-xl border border-white/10 bg-[#14171d] py-1 shadow-2xl">
                          {myRole === "leader" && m.role === "member" && (
                            <MenuItem
                              icon={<Shield className="h-4 w-4 text-emerald-500" />}
                              label="Promote to Co-Leader"
                              onClick={() => runAction(m, "promote")}
                            />
                          )}
                          {myRole === "leader" && m.role === "co_leader" && (
                            <MenuItem
                              icon={<ShieldOff className="h-4 w-4 text-orange-500" />}
                              label="Demote to Member"
                              onClick={() => runAction(m, "demote")}
                            />
                          )}
                          {myRole === "leader" && (
                            <MenuItem
                              icon={<Crown className="h-4 w-4 text-gold" />}
                              label="Transfer Leadership"
                              onClick={() => runAction(m, "transfer")}
                            />
                          )}
                          <MenuItem
                            icon={<UserX className="h-4 w-4" />}
                            label="Kick from Clan"
                            destructive
                            onClick={() => runAction(m, "kick")}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-white/5 ${destructive ? "text-destructive" : "text-white"}`}
    >
      {icon} {label}
    </button>
  );
}
