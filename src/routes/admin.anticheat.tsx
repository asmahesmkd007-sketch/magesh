// =====================================================================
// ADMIN — ANTI-CHEAT DASHBOARD
// ---------------------------------------------------------------------
// The human review surface for the fair-play system: live flagged games,
// the risk-ranked player list, and a per-player evidence view (flags,
// event timeline, engine/ACPL metrics, move-time graph, device info,
// connection history, reports and the full enforcement log).
//
// Every mutation here calls a server function that re-checks the admin
// role and applies the multi-indicator evidence gate — this page cannot
// ban anyone on its own say-so.
// =====================================================================

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, ShieldAlert, Gavel, RotateCcw } from "lucide-react";

import { AdminShell } from "@/components/site/AdminShell";
import { Card, GhostButton, GoldButton } from "@/components/site/Primitives";
import {
  EnforcementDialog,
  EvidenceTimeline,
  FlagRow,
  MoveTimeChart,
  RiskBreakdown,
  RiskChip,
  StatTile,
  type EnforcementSubmit,
} from "@/components/admin/AntiCheatPanels";
import {
  enforce,
  getGameEvidence,
  getOverview,
  getPlayerDetail,
  listFlags,
  listPlayers,
  resetRiskScore,
  reviewFlag,
  type AcFlag,
  type AcGameEvidence,
  type AcOverview,
  type AcPlayer,
  type AcPlayerDetail,
} from "@/lib/api/antiCheatClient";
import type { RiskLevel } from "@/lib/anticheat/types";

type Search = { player?: string; game?: string; tab?: string };

export const Route = createFileRoute("/admin/anticheat")({
  head: () => ({
    meta: [
      { title: "Admin — Anti-Cheat — ChessOx" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    player: typeof search.player === "string" ? search.player : undefined,
    game: typeof search.game === "string" ? search.game : undefined,
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: () => (
    <AdminShell title="Anti-Cheat">
      <AntiCheatAdmin />
    </AdminShell>
  ),
});

type Tab = "overview" | "flags" | "players";

function AntiCheatAdmin() {
  const { player, game, tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/anticheat" });

  const activeTab: Tab = tab === "flags" || tab === "players" ? tab : "overview";

  const [overview, setOverview] = useState<AcOverview | null>(null);
  const [players, setPlayers] = useState<AcPlayer[]>([]);
  const [flags, setFlags] = useState<AcFlag[]>([]);
  const [flagStatus, setFlagStatus] = useState<string>("open");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [o, p, f] = await Promise.all([
      getOverview(),
      listPlayers(0, 100),
      listFlags(flagStatus || undefined, 200),
    ]);
    setOverview(o);
    setPlayers(p);
    setFlags(f);
  }, [flagStatus]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .catch((err) => {
        if (alive)
          toast.error(err instanceof Error ? err.message : "Failed to load anti-cheat data");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const setTab = (next: Tab) =>
    navigate({ search: (prev: Search) => ({ ...prev, tab: next }), replace: true });
  const openPlayer = (userId: string) =>
    navigate({ search: (prev: Search) => ({ ...prev, player: userId, game: undefined }) });
  const openGame = (gameId: string) =>
    navigate({ search: (prev: Search) => ({ ...prev, game: gameId }) });

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (player) {
    return (
      <PlayerDetailView
        userId={player}
        gameId={game}
        onBack={() => navigate({ search: () => ({}) })}
        onOpenGame={openGame}
        onCloseGame={() => navigate({ search: (prev: Search) => ({ ...prev, game: undefined }) })}
        onChanged={refresh}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["overview", "flags", "players"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full border px-3.5 py-1.5 text-xs capitalize transition ${
                activeTab === t
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <GhostButton onClick={refresh} disabled={refreshing} className="border border-white/10">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </GhostButton>
      </div>

      {activeTab === "overview" && overview && (
        <OverviewTab overview={overview} onOpenGame={openGame} />
      )}

      {activeTab === "flags" && (
        <FlagsTab
          flags={flags}
          status={flagStatus}
          onStatus={setFlagStatus}
          onOpenPlayer={openPlayer}
          onOpenGame={openGame}
          onChanged={refresh}
        />
      )}

      {activeTab === "players" && <PlayersTab players={players} onOpen={openPlayer} />}
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────

function OverviewTab({
  overview,
  onOpenGame,
}: {
  overview: AcOverview;
  onOpenGame: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open flags" value={overview.open_flags} hint="Awaiting review" />
        <StatTile
          label="High risk players"
          value={overview.high_risk_players}
          hint="Score 81-100"
          tone={overview.high_risk_players > 0 ? "alert" : "normal"}
        />
        <StatTile label="In review band" value={overview.review_players} hint="Score 61-80" />
        <StatTile label="Confirmed flags" value={overview.confirmed_flags} hint="All time" />
        <StatTile
          label="Events (24h)"
          value={overview.events_24h}
          hint="Server + client evidence"
        />
        <StatTile
          label="Browser signals (24h)"
          value={overview.browser_events_24h}
          hint="Batched telemetry"
        />
        <StatTile label="Under review" value={overview.under_review} hint="Being investigated" />
        <StatTile label="Actions (30d)" value={overview.actions_30d} hint="Enforcement decisions" />
      </div>

      <Card className="p-0">
        <div className="border-b border-white/5 px-4 py-3 text-sm font-medium">
          Live flagged games
        </div>
        {overview.live_flagged_games.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No games are currently flagged. Detection runs continuously — findings appear here as
            they are produced.
          </p>
        ) : (
          <div className="divide-y divide-white/5">
            {overview.live_flagged_games.map((g) => (
              <button
                key={g.game_id}
                onClick={() => onOpenGame(g.game_id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm hover:bg-white/[0.02]"
              >
                <div className="min-w-0">
                  <div className="truncate">
                    {g.white_username ?? "?"} vs {g.black_username ?? "?"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {g.flag_type.replace(/_/g, " ")} · {g.username ?? "unknown"} ·{" "}
                    {new Date(g.created_at).toLocaleString("en-IN")}
                  </div>
                </div>
                <span className="shrink-0 text-xs uppercase tracking-wider text-muted-foreground">
                  {g.game_status ?? ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Flags queue ───────────────────────────────────────────────────────

function FlagsTab({
  flags,
  status,
  onStatus,
  onOpenPlayer,
  onOpenGame,
  onChanged,
}: {
  flags: AcFlag[];
  status: string;
  onStatus: (s: string) => void;
  onOpenPlayer: (id: string) => void;
  onOpenGame: (id: string) => void;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const review = async (flag: AcFlag, decision: "confirm" | "dismiss") => {
    setBusyId(flag.id);
    try {
      await reviewFlag(flag.id, decision);
      toast.success(decision === "confirm" ? "Flag confirmed" : "Flag dismissed as false positive");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Review failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          { v: "open", l: "Open" },
          { v: "under_review", l: "Under review" },
          { v: "confirmed", l: "Confirmed" },
          { v: "dismissed", l: "Dismissed" },
          { v: "", l: "All" },
        ].map((s) => (
          <button
            key={s.v}
            onClick={() => onStatus(s.v)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              status === s.v
                ? "border-gold/40 bg-gold/10 text-gold"
                : "border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.l}
          </button>
        ))}
      </div>

      <Card className="p-0">
        {flags.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No flags in this state.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {flags.map((f) => (
              <div key={f.id}>
                <div className="flex items-center gap-2 px-4 pt-3 text-xs text-muted-foreground">
                  <button
                    onClick={() => onOpenPlayer(f.user_id)}
                    className="text-gold underline underline-offset-2"
                  >
                    {f.username ?? f.user_id.slice(0, 8)}
                  </button>
                  {f.time_control && <span>· {f.time_control}</span>}
                </div>
                <FlagRow
                  flag={f}
                  busy={busyId === f.id}
                  onReview={(d) => review(f, d)}
                  onOpenGame={f.game_id ? () => onOpenGame(f.game_id!) : undefined}
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Player list ───────────────────────────────────────────────────────

function PlayersTab({ players, onOpen }: { players: AcPlayer[]; onOpen: (id: string) => void }) {
  const [minLevel, setMinLevel] = useState<RiskLevel | "all">("all");
  const filtered = useMemo(() => {
    if (minLevel === "all") return players;
    const order: RiskLevel[] = ["safe", "monitor", "warning", "review", "high_risk"];
    const min = order.indexOf(minLevel);
    return players.filter((p) => order.indexOf(p.risk_level) >= min);
  }, [players, minLevel]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["all", "monitor", "warning", "review", "high_risk"] as const).map((l) => (
          <button
            key={l}
            onClick={() => setMinLevel(l)}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition ${
              minLevel === l
                ? "border-gold/40 bg-gold/10 text-gold"
                : "border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            {l === "all" ? "All" : l.replace("_", " ") + "+"}
          </button>
        ))}
      </div>

      <Card className="p-0">
        {filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No players in this band. Scores rise only when corroborating evidence accumulates.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-normal">Player</th>
                  <th className="px-4 py-2.5 font-normal">Risk</th>
                  <th className="px-4 py-2.5 text-right font-normal">Engine</th>
                  <th className="px-4 py-2.5 text-right font-normal">Timing</th>
                  <th className="px-4 py-2.5 text-right font-normal">Behavior</th>
                  <th className="px-4 py-2.5 text-right font-normal">Flags</th>
                  <th className="px-4 py-2.5 font-normal">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((p) => (
                  <tr
                    key={p.user_id}
                    onClick={() => onOpen(p.user_id)}
                    className="cursor-pointer hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-2.5">{p.username ?? p.user_id.slice(0, 8)}</td>
                    <td className="px-4 py-2.5">
                      <RiskChip level={p.risk_level} score={p.total_score} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {Number(p.engine_score).toFixed(1)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {Number(p.timing_score).toFixed(1)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {Number(p.behavior_score).toFixed(1)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {p.open_flags}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {p.account_status ?? "active"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Player detail ─────────────────────────────────────────────────────

function PlayerDetailView({
  userId,
  gameId,
  onBack,
  onOpenGame,
  onCloseGame,
  onChanged,
}: {
  userId: string;
  gameId?: string;
  onBack: () => void;
  onOpenGame: (id: string) => void;
  onCloseGame: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AcPlayerDetail | null>(null);
  const [evidence, setEvidence] = useState<AcGameEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showEnforce, setShowEnforce] = useState(false);
  const [enforceError, setEnforceError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const d = await getPlayerDetail(userId);
    setDetail(d);
  }, [userId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    reload()
      .catch((err) => {
        if (alive) toast.error(err instanceof Error ? err.message : "Failed to load player");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reload]);

  useEffect(() => {
    if (!gameId) {
      setEvidence(null);
      return;
    }
    let alive = true;
    getGameEvidence(gameId)
      .then((e) => {
        if (alive) setEvidence(e);
      })
      .catch(() => {
        if (alive) toast.error("Failed to load game evidence");
      });
    return () => {
      alive = false;
    };
  }, [gameId]);

  const activeFlags = useMemo(
    () => (detail?.flags ?? []).filter((f) => f.status !== "dismissed"),
    [detail],
  );
  const distinctTypes = useMemo(
    () => new Set(activeFlags.map((f) => f.flag_type)).size,
    [activeFlags],
  );

  const doReview = async (flag: AcFlag, decision: "confirm" | "dismiss") => {
    setBusy(true);
    try {
      await reviewFlag(flag.id, decision);
      toast.success(decision === "confirm" ? "Flag confirmed" : "Flag dismissed as false positive");
      await reload();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Review failed");
    } finally {
      setBusy(false);
    }
  };

  const doEnforce = async (input: EnforcementSubmit) => {
    setBusy(true);
    setEnforceError(null);
    try {
      await enforce(userId, input.action, input.reason, input.durationHours);
      toast.success(`Applied ${input.action}`);
      setShowEnforce(false);
      await reload();
      onChanged();
    } catch (err) {
      setEnforceError(err instanceof Error ? err.message : "Enforcement failed");
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    if (!confirm("Reset this player's risk score to zero? Evidence is kept.")) return;
    setBusy(true);
    try {
      await resetRiskScore(userId, "Reset from anti-cheat dashboard");
      toast.success("Risk score reset");
      await reload();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }
  if (!detail?.profile) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Player not found.</p>
        <div className="mt-3">
          <GhostButton onClick={onBack} className="border border-white/10">
            Back
          </GhostButton>
        </div>
      </Card>
    );
  }

  const risk = detail.risk;
  const level: RiskLevel = risk?.risk_level ?? "safe";
  const total = Number(risk?.total_score ?? 0);
  const fingerprint = detail.fingerprints[0];

  return (
    <div className="space-y-5">
      {showEnforce && (
        <EnforcementDialog
          username={detail.profile.username}
          activeFlags={activeFlags.length}
          distinctTypes={distinctTypes}
          totalScore={total}
          onSubmit={doEnforce}
          onClose={() => {
            setShowEnforce(false);
            setEnforceError(null);
          }}
          error={enforceError}
          busy={busy}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <GhostButton onClick={onBack} className="border border-white/10">
            ← Back
          </GhostButton>
          <div>
            <div className="flex items-center gap-2 font-display text-xl">
              {detail.profile.username}
              <RiskChip level={level} score={total} />
            </div>
            <div className="text-xs text-muted-foreground">
              Account {detail.profile.account_status ?? "active"} · joined{" "}
              {new Date(detail.profile.created_at).toLocaleDateString("en-IN")}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <GhostButton onClick={doReset} disabled={busy} className="border border-white/10">
            <RotateCcw className="h-3.5 w-3.5" /> Reset risk
          </GhostButton>
          <GoldButton onClick={() => setShowEnforce(true)} disabled={busy}>
            <Gavel className="h-4 w-4" /> Enforcement
          </GoldButton>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="h-4 w-4 text-gold" /> Risk breakdown
          </div>
          <RiskBreakdown
            scores={{
              engine: Number(risk?.engine_score ?? 0),
              timing: Number(risk?.timing_score ?? 0),
              behavior: Number(risk?.behavior_score ?? 0),
              connection: Number(risk?.connection_score ?? 0),
              account: Number(risk?.account_score ?? 0),
            }}
          />
          <div className="mt-4 space-y-1 border-t border-white/5 pt-3 text-xs text-muted-foreground">
            <div>Flagged games: {risk?.flagged_games ?? 0}</div>
            <div>Active flags: {activeFlags.length}</div>
            <div>Distinct indicators: {distinctTypes}</div>
            <div>Reports filed: {detail.reports.length}</div>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 text-sm font-medium">Device &amp; connection</div>
          {fingerprint ? (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div>
                <div className="text-muted-foreground">Fingerprint</div>
                <div className="font-mono">{fingerprint.fingerprint_hash.slice(0, 24)}…</div>
                <div className="mt-1 text-muted-foreground">
                  Seen {fingerprint.times_seen}× · last{" "}
                  {new Date(fingerprint.last_seen_at).toLocaleString("en-IN")}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">User agent</div>
                <div className="break-words">{fingerprint.user_agent ?? "—"}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-muted-foreground">Shared devices / IPs</div>
                {detail.shared_devices.length === 0 ? (
                  <div>No overlap with other accounts.</div>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {detail.shared_devices.map((s, i) => (
                      <li key={`${s.user_id}-${i}`}>
                        {s.username ?? s.user_id.slice(0, 8)} —{" "}
                        {s.same_ip ? "same IP" : "same device fingerprint"} (last{" "}
                        {new Date(s.last_seen_at).toLocaleDateString("en-IN")})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No device information recorded yet.</p>
          )}
        </Card>
      </div>

      {evidence && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium">
              Game evidence — {evidence.game?.white_username ?? "?"} vs{" "}
              {evidence.game?.black_username ?? "?"}
            </div>
            <button
              onClick={onCloseGame}
              className="text-xs text-muted-foreground underline underline-offset-2"
            >
              Close
            </button>
          </div>
          <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>{evidence.game?.time_control}</span>
            <span>{evidence.game?.is_rated ? "Rated" : "Casual"}</span>
            <span>{evidence.game?.moves_count} plies</span>
            <span>{evidence.game?.end_reason ?? evidence.game?.result}</span>
          </div>
          <MoveTimeChart evidence={evidence} />
          <div className="mt-4">
            <div className="mb-2 text-sm font-medium">Move list</div>
            <div className="max-h-40 overflow-y-auto rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {evidence.moves.map((m) => `${m.ply}. ${m.san}`).join("  ")}
            </div>
          </div>
        </Card>
      )}

      <Card className="p-0">
        <div className="border-b border-white/5 px-4 py-3 text-sm font-medium">
          Flags ({detail.flags.length})
        </div>
        {detail.flags.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No flags raised for this player.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {detail.flags.map((f) => (
              <FlagRow
                key={f.id}
                flag={f}
                busy={busy}
                onReview={(d) => doReview(f, d)}
                onOpenGame={f.game_id ? () => onOpenGame(f.game_id!) : undefined}
              />
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Evidence timeline</div>
          <EvidenceTimeline events={detail.events} browserEvents={detail.browser_events} />
        </Card>

        <div className="space-y-5">
          <Card className="p-4">
            <div className="mb-2 text-sm font-medium">
              Enforcement log ({detail.actions.length})
            </div>
            {detail.actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No actions taken.</p>
            ) : (
              <ul className="divide-y divide-white/5 text-sm">
                {detail.actions.map((a) => (
                  <li key={a.id} className="py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize text-gold">{a.action}</span>
                      {a.expires_at && (
                        <span className="text-xs text-muted-foreground">
                          until {new Date(a.expires_at).toLocaleString("en-IN")}
                        </span>
                      )}
                      {a.revoked_at && <span className="text-xs text-emerald-300">lifted</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{a.reason}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {a.admin_username ?? "admin"} ·{" "}
                      {new Date(a.created_at).toLocaleString("en-IN")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-2 text-sm font-medium">Review history ({detail.reviews.length})</div>
            {detail.reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reviews recorded.</p>
            ) : (
              <ul className="divide-y divide-white/5 text-sm">
                {detail.reviews.map((r) => (
                  <li key={r.id} className="py-2">
                    <span className="capitalize text-gold">{r.decision.replace("_", " ")}</span>
                    {r.notes && <span className="text-muted-foreground"> — {r.notes}</span>}
                    <div className="text-[11px] text-muted-foreground">
                      {r.admin_username ?? "admin"} ·{" "}
                      {new Date(r.created_at).toLocaleString("en-IN")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-2 text-sm font-medium">Player reports ({detail.reports.length})</div>
            {detail.reports.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reports filed against this player.</p>
            ) : (
              <ul className="divide-y divide-white/5 text-sm">
                {detail.reports.map((r) => (
                  <li key={r.id} className="py-2">
                    <div>{r.reason ?? "Report"}</div>
                    <div className="text-xs text-muted-foreground">{r.description}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.status} · {new Date(r.created_at).toLocaleString("en-IN")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
