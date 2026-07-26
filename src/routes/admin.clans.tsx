// Admin — Clans: directory search, member/officer visibility, war stats,
// and moderated removal (audited via clan_deletion_log). All mutations run
// through admin_delete_clan, which re-checks is_admin() server-side.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  Users,
  Crown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card, Stat } from "@/components/site/Primitives";
import {
  adminListClans,
  adminDeleteClan,
  adminListDeletedClans,
  getClanMembers,
  getJoinRequests,
  type ClanDeletionLogEntry,
} from "@/lib/clanApi";
import { RoleBadge } from "@/components/clan/ClanPrimitives";
import type { ClanMember, ClanJoinRequest, ClanSummary } from "@/types/clan";

export const Route = createFileRoute("/admin/clans")({
  head: () => ({
    meta: [{ title: "Admin — Clans — ChessOx" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: () => (
    <AdminShell title="Clan Management">
      <ClanAdmin />
    </AdminShell>
  ),
});

function ClanAdmin() {
  const [tab, setTab] = useState<"clans" | "removed">("clans");
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(["clans", "removed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-1.5 text-xs capitalize ${
              tab === t
                ? "border-gold/50 bg-gold/10 text-gold"
                : "border-white/10 text-muted-foreground"
            }`}
          >
            {t === "clans" ? "All Clans" : "Removed Clans"}
          </button>
        ))}
      </div>
      {tab === "clans" ? <ClansPanel /> : <RemovedPanel />}
    </div>
  );
}

function ClansPanel() {
  const [clans, setClans] = useState<ClanSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { clans: rows, total: t } = await adminListClans(search, 50, 0);
      setClans(rows);
      setTotal(t);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load clans");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function handleRemove(clan: ClanSummary) {
    const reason = window.prompt(`Remove ${clan.name} [${clan.tag}]? Enter a moderation reason:`);
    if (reason === null) return;
    try {
      await adminDeleteClan(clan.id, reason);
      toast.success(`${clan.name} removed`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove clan");
    }
  }

  const totalMembers = clans.reduce((sum, c) => sum + c.member_count, 0);
  const fullClans = clans.filter((c) => c.member_count >= c.max_members).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total Clans" value={total} />
        <Stat label="Members (loaded)" value={totalMembers} />
        <Stat label="Full Clans" value={fullClans} hint={`of ${clans.length} loaded`} />
        <Stat
          label="Avg Rating"
          value={
            clans.length
              ? Math.round(clans.reduce((s, c) => s + c.clan_rating, 0) / clans.length)
              : 0
          }
        />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by clan name or tag..."
          className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-gold/50"
        />
      </div>

      {loading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : clans.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No clans found.</Card>
      ) : (
        <div className="space-y-3">
          {clans.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-base text-white">{c.name}</span>
                    <span className="rounded bg-gold/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-gold">
                      [{c.tag}]
                    </span>
                    <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                      {c.privacy}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {c.member_count}/{c.max_members}
                    </span>
                    <span>Rank #{c.global_rank}</span>
                    <span>Score {c.clan_score}</span>
                    <span>
                      Wars {c.war_wins}-{c.war_losses}-{c.war_draws}
                    </span>
                    <span>{c.country}</span>
                    <span>Founded {new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-muted-foreground hover:text-gold"
                  >
                    {expanded === c.id ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    Details
                  </button>
                  <button
                    onClick={() => handleRemove(c)}
                    className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-400 hover:bg-rose-500/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </div>
              {expanded === c.id && <ClanDetail clanId={c.id} />}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ClanDetail({ clanId }: { clanId: string }) {
  const [members, setMembers] = useState<ClanMember[]>([]);
  const [requests, setRequests] = useState<ClanJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getClanMembers(clanId), getJoinRequests(clanId)])
      .then(([m, r]) => {
        if (cancelled) return;
        setMembers(m);
        setRequests(r);
      })
      .catch(() => {
        if (!cancelled) {
          setMembers([]);
          setRequests([]);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [clanId]);

  if (loading) {
    return (
      <div className="mt-3 grid place-items-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-4 border-t border-white/5 pt-4 md:grid-cols-2">
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Crown className="h-3.5 w-3.5" /> Members ({members.length})
        </div>
        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs"
            >
              <span className="truncate text-white">{m.profiles?.username ?? "Unknown"}</span>
              <RoleBadge role={m.role} />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Shield className="h-3.5 w-3.5" /> Pending Requests ({requests.length})
        </div>
        {requests.length === 0 ? (
          <div className="text-xs text-muted-foreground">None pending.</div>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs"
              >
                <span className="truncate text-white">{r.profiles?.username ?? "Unknown"}</span>
                <span className="text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RemovedPanel() {
  const [rows, setRows] = useState<ClanDeletionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminListDeletedClans()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (rows.length === 0) {
    return <Card className="p-6 text-sm text-muted-foreground">No clans have been removed.</Card>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
                <span className="font-display text-base text-white">{r.name}</span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  [{r.tag}]
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{r.reason || "No reason given"}</p>
            </div>
            <div className="shrink-0 text-right text-xs text-muted-foreground">
              <div>{r.member_count} members at removal</div>
              <div>{new Date(r.created_at).toLocaleString()}</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
