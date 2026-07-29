// =====================================================================
// ANTI-CHEAT DASHBOARD — presentational pieces
// ---------------------------------------------------------------------
// Pure presentation for the /admin/anticheat route: risk chips, the
// evidence timeline, the move-time chart and the enforcement dialog.
// No data fetching and no policy here — the enforcement gate lives
// server-side in acEnforce, and this UI reflects it rather than
// re-implementing it.
// =====================================================================

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ShieldCheck, X } from "lucide-react";

import { Card, GhostButton, GoldButton } from "@/components/site/Primitives";
import type { AcBrowserEvent, AcEvent, AcFlag, AcGameEvidence } from "@/lib/api/antiCheatClient";
import type { AntiCheatSeverity, RiskLevel } from "@/lib/anticheat/types";

import { CATEGORY_ROWS, RISK_CLASS, RISK_LABEL, SERIES, SEVERITY_CLASS } from "./antiCheatTheme";

export function RiskChip({ level, score }: { level: RiskLevel; score?: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${RISK_CLASS[level]}`}
    >
      {RISK_LABEL[level]}
      {score !== undefined && <span className="font-mono tabular-nums">{Math.round(score)}</span>}
    </span>
  );
}

export function SeverityChip({ severity }: { severity: AntiCheatSeverity }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wider ${SEVERITY_CLASS[severity]}`}
    >
      {severity}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "alert" | "normal";
}) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-mono text-2xl tabular-nums ${tone === "alert" ? "text-rose-300" : "text-gold"}`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

/** Risk breakdown: the five scoring dimensions and their category caps. */
export function RiskBreakdown({
  scores,
}: {
  scores: {
    engine: number;
    timing: number;
    behavior: number;
    connection: number;
    account: number;
  };
}) {
  return (
    <div className="space-y-2.5">
      {CATEGORY_ROWS.map((r) => {
        const value = scores[r.key] ?? 0;
        const pct = Math.min(100, (value / r.cap) * 100);
        return (
          <div key={r.key}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-mono tabular-nums">
                {value.toFixed(1)}
                <span className="text-muted-foreground"> / {r.cap}</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: SERIES.primary }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Per-move think time for both players in a flagged game. */
export function MoveTimeChart({ evidence }: { evidence: AcGameEvidence }) {
  const data = useMemo(() => {
    const rows: Array<{ ply: number; white: number | null; black: number | null }> = [];
    const moves = evidence.moves ?? [];
    // time_left_ms is what the DB stores per move; the think time is the
    // drop between a player's consecutive readings.
    let lastWhite: number | null = null;
    let lastBlack: number | null = null;
    for (const m of moves) {
      const isWhite = m.ply % 2 === 1;
      const left = m.time_left_ms;
      let used: number | null = null;
      if (left !== null) {
        const prev = isWhite ? lastWhite : lastBlack;
        if (prev !== null) used = Math.max(0, (prev - left) / 1000);
        if (isWhite) lastWhite = left;
        else lastBlack = left;
      }
      rows.push({
        ply: m.ply,
        white: isWhite ? used : null,
        black: isWhite ? null : used,
      });
    }
    return rows;
  }, [evidence]);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No move timing recorded for this game.</p>;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: SERIES.primary }}
          />
          White think time
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: SERIES.secondary }}
          />
          Black think time
        </span>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="ac-white" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES.primary} stopOpacity={0.35} />
                <stop offset="100%" stopColor={SERIES.primary} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="ac-black" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES.secondary} stopOpacity={0.35} />
                <stop offset="100%" stopColor={SERIES.secondary} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="ply" tick={{ fill: "#888", fontSize: 11 }} />
            <YAxis
              tick={{ fill: "#888", fontSize: 11 }}
              width={44}
              label={{
                value: "sec",
                position: "insideTopLeft",
                fill: "#888",
                fontSize: 10,
                offset: 8,
              }}
            />
            <Tooltip
              contentStyle={{
                background: "#141414",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number | string, name: string) => [
                `${Number(value).toFixed(1)}s`,
                name === "white" ? "White" : "Black",
              ]}
              labelFormatter={(l) => `Ply ${l}`}
            />
            <Area
              type="monotone"
              dataKey="white"
              stroke={SERIES.primary}
              strokeWidth={2}
              fill="url(#ac-white)"
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="black"
              stroke={SERIES.secondary}
              strokeWidth={2}
              fill="url(#ac-black)"
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Merged, newest-first evidence timeline (server events + browser telemetry). */
export function EvidenceTimeline({
  events,
  browserEvents,
  limit = 60,
}: {
  events: AcEvent[];
  browserEvents: AcBrowserEvent[];
  limit?: number;
}) {
  const merged = useMemo(() => {
    const a = events.map((e) => ({
      key: `e${e.id}`,
      at: e.created_at,
      type: e.event_type,
      severity: e.severity,
      source: e.source,
      count: 1,
      metadata: e.metadata,
      gameId: e.game_id,
    }));
    const b = browserEvents.map((e) => ({
      key: `b${e.id}`,
      at: e.created_at,
      type: e.event_type,
      severity: "info" as AntiCheatSeverity,
      source: "client",
      count: e.count,
      metadata: e.metadata,
      gameId: e.game_id,
    }));
    return [...a, ...b]
      .sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())
      .slice(0, limit);
  }, [events, browserEvents, limit]);

  if (merged.length === 0) {
    return <p className="text-sm text-muted-foreground">No events recorded.</p>;
  }

  return (
    <ol className="divide-y divide-white/5">
      {merged.map((e) => (
        <li key={e.key} className="flex items-start gap-3 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{e.type.replace(/_/g, " ")}</span>
              {e.count > 1 && (
                <span className="font-mono text-xs text-muted-foreground">×{e.count}</span>
              )}
              <SeverityChip severity={e.severity} />
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {e.source}
              </span>
            </div>
            {e.metadata && Object.keys(e.metadata).length > 0 && (
              <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {JSON.stringify(e.metadata)}
              </div>
            )}
          </div>
          <time className="shrink-0 text-xs text-muted-foreground">
            {new Date(e.at).toLocaleString("en-IN")}
          </time>
        </li>
      ))}
    </ol>
  );
}

export function FlagRow({
  flag,
  onReview,
  busy,
  onOpenGame,
}: {
  flag: AcFlag;
  onReview?: (decision: "confirm" | "dismiss") => void;
  busy?: boolean;
  onOpenGame?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const reviewed = flag.status === "confirmed" || flag.status === "dismissed";
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gold">{flag.flag_type.replace(/_/g, " ")}</span>
            <SeverityChip severity={flag.severity} />
            <span className="text-xs text-muted-foreground">{flag.status.replace(/_/g, " ")}</span>
          </div>
          <p className="mt-1 text-sm">{flag.summary}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{new Date(flag.created_at).toLocaleString("en-IN")}</span>
            {flag.game_id && (
              <button onClick={onOpenGame} className="underline underline-offset-2 hover:text-gold">
                View game evidence
              </button>
            )}
            <button onClick={() => setOpen((o) => !o)} className="underline underline-offset-2">
              {open ? "Hide" : "Show"} details
            </button>
          </div>
          {open && (
            <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
              {JSON.stringify(flag.details, null, 2)}
            </pre>
          )}
        </div>
        {onReview && !reviewed && (
          <div className="flex shrink-0 gap-2">
            <GhostButton
              onClick={() => onReview("dismiss")}
              disabled={busy}
              className="border border-white/10 text-xs"
            >
              <X className="h-3.5 w-3.5" /> False positive
            </GhostButton>
            <GoldButton onClick={() => onReview("confirm")} disabled={busy} className="text-xs">
              <ShieldCheck className="h-3.5 w-3.5" /> Confirm
            </GoldButton>
          </div>
        )}
      </div>
    </div>
  );
}

export interface EnforcementSubmit {
  action: "warning" | "restriction" | "suspension" | "ban" | "unban";
  reason: string;
  durationHours?: number;
}

/**
 * Enforcement dialog. It surfaces the evidence requirement in the UI,
 * but the binding check runs server-side in acEnforce — a rejected
 * action returns its reason, which is shown here verbatim.
 */
export function EnforcementDialog({
  username,
  activeFlags,
  distinctTypes,
  totalScore,
  onSubmit,
  onClose,
  error,
  busy,
}: {
  username: string;
  activeFlags: number;
  distinctTypes: number;
  totalScore: number;
  onSubmit: (input: EnforcementSubmit) => void;
  onClose: () => void;
  error?: string | null;
  busy?: boolean;
}) {
  const [action, setAction] = useState<EnforcementSubmit["action"]>("warning");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);
  const needsDuration = action === "restriction" || action === "suspension";
  const severe = action === "suspension" || action === "ban";
  const meetsBar = severe
    ? activeFlags >= 2 && distinctTypes >= 2
    : activeFlags >= 1 || totalScore >= 41;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <Card className="w-full max-w-lg p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl">Enforcement — {username}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Risk {Math.round(totalScore)}/100 · {activeFlags} active flag(s) across{" "}
              {distinctTypes} indicator type(s)
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(["warning", "restriction", "suspension", "ban", "unban"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAction(a)}
              className={`rounded-lg border px-3 py-2 text-xs capitalize transition ${
                action === a
                  ? "border-gold/50 bg-gold/10 text-gold"
                  : "border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        {severe && !meetsBar && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              A {action} needs at least 2 active flags spanning 2 distinct indicator types, or a
              confirmed flag with a risk score above 60. Confirm the supporting evidence first — the
              server will reject this otherwise.
            </span>
          </div>
        )}

        {needsDuration && (
          <label className="mt-4 block">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Duration (hours)
            </span>
            <input
              type="number"
              min={1}
              max={8760}
              value={hours}
              onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
            />
          </label>
        )}

        <label className="mt-4 block">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Reason (recorded permanently and shown to the player)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
            placeholder="Summarize the evidence supporting this action…"
          />
        </label>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <GhostButton onClick={onClose} className="border border-white/10">
            Cancel
          </GhostButton>
          <GoldButton
            onClick={() =>
              onSubmit({
                action,
                reason: reason.trim(),
                durationHours: needsDuration ? hours : undefined,
              })
            }
            disabled={busy || reason.trim().length < 3}
          >
            Apply {action}
          </GoldButton>
        </div>
      </Card>
    </div>
  );
}
