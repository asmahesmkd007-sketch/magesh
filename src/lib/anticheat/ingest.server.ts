// =====================================================================
// ANTI-CHEAT — server ingestion & scoring (server-only)
// ---------------------------------------------------------------------
// Everything that writes anti-cheat state lives here: evidence inserts,
// the decayed risk-score update (the only writer of player_risk_scores),
// flag creation, fingerprint registration and admin alerting. Import
// only via dynamic import() from server-function handlers — this module
// touches the service-role client.
//
// Performance contract: callers fire these helpers with `void` (never
// awaited on the gameplay path), batches map to a handful of inserts,
// and admin alerts are deduped in-process before touching the DB.
// =====================================================================

import { createHash } from "node:crypto";

import { logger } from "@/lib/logger";

import {
  ANTICHEAT_CONFIG,
  BROWSER_EVENT_WEIGHTS,
  FLAG_SEVERITY_WEIGHTS,
  SERVER_EVENT_WEIGHTS,
} from "./config";
import { EMPTY_RAWS, applyDeltas, computeRisk, decayRaws } from "./risk";
import type {
  AntiCheatSeverity,
  AntiCheatSource,
  BrowserEventType,
  ClientEventReport,
  FlagType,
  RawRiskAccumulators,
  RiskCategory,
  RiskLevel,
  ServerEventType,
} from "./types";

// ── Loose DB facade ───────────────────────────────────────────────────
// The anti-cheat tables are not in the generated Supabase types yet, so
// we type the handful of query shapes we actually use (same approach as
// game.functions.ts / adminClient.ts, but without `any`).
type DbErr = { message: string } | null;
export type Row = Record<string, unknown>;

interface LooseFilter extends PromiseLike<{ data: Row[] | null; error: DbErr }> {
  select: (cols?: string) => LooseFilter;
  eq: (col: string, v: unknown) => LooseFilter;
  in: (col: string, v: unknown[]) => LooseFilter;
  gte: (col: string, v: unknown) => LooseFilter;
  is: (col: string, v: unknown) => LooseFilter;
  not: (col: string, op: string, v: unknown) => LooseFilter;
  order: (col: string, opts?: { ascending?: boolean }) => LooseFilter;
  limit: (n: number) => LooseFilter;
  maybeSingle: () => PromiseLike<{ data: Row | null; error: DbErr }>;
}

interface LooseTable {
  select: (cols?: string) => LooseFilter;
  insert: (rows: Row | Row[]) => LooseFilter;
  upsert: (
    rows: Row | Row[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) => LooseFilter;
  update: (row: Row) => LooseFilter;
}

export interface LooseDb {
  from: (table: string) => LooseTable;
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: DbErr }>;
}

export async function getDb(): Promise<LooseDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as LooseDb;
}

// ── Evidence writers ──────────────────────────────────────────────────

export interface ServerEventInput {
  userId: string | null;
  gameId: string | null;
  type: ServerEventType;
  severity?: AntiCheatSeverity;
  metadata?: Record<string, unknown>;
}

/**
 * Record server-observed events and fold their weights into the risk
 * score. Used by the move handler — always call with `void` so a slow
 * insert can never delay a move response.
 */
export async function recordServerEvents(events: ServerEventInput[]): Promise<void> {
  if (events.length === 0) return;
  try {
    const db = await getDb();
    const rows = events.map((e) => ({
      user_id: e.userId,
      game_id: e.gameId,
      event_type: e.type,
      severity: e.severity ?? SERVER_EVENT_WEIGHTS[e.type].severity,
      source: "server" satisfies AntiCheatSource,
      metadata: e.metadata ?? {},
    }));
    const { error } = await db.from("anti_cheat_events").insert(rows);
    if (error) throw new Error(error.message);

    // Fold weights per user.
    const perUser = new Map<string, Partial<RawRiskAccumulators>>();
    for (const e of events) {
      if (!e.userId) continue;
      const w = SERVER_EVENT_WEIGHTS[e.type];
      if (w.weight <= 0) continue;
      const acc = perUser.get(e.userId) ?? {};
      acc[w.category] = (acc[w.category] ?? 0) + Math.min(w.weight, w.perBatchCap);
      perUser.set(e.userId, acc);
    }
    for (const [userId, deltas] of perUser) {
      await applyRiskUpdate(userId, deltas);
    }
  } catch (error) {
    logger.warn("anticheat: failed to record server events", { error });
  }
}

/** Persist a batch of client telemetry and fold weights into the score. */
export async function ingestClientBatch(input: {
  userId: string;
  gameId: string | null;
  sessionId: string;
  events: ClientEventReport[];
}): Promise<void> {
  const db = await getDb();
  const cfg = ANTICHEAT_CONFIG.server;

  const rows: Row[] = [];
  const mirrored: Row[] = [];
  const deltas: Partial<RawRiskAccumulators> = {};

  for (const e of input.events) {
    const weight = BROWSER_EVENT_WEIGHTS[e.type];
    const count = Math.min(Math.max(1, Math.floor(e.count)), cfg.maxCountPerEvent);
    const meta = boundMeta(e.meta, cfg.maxMetaChars);
    const clientTs =
      typeof e.firstAt === "number" && Number.isFinite(e.firstAt)
        ? new Date(clampTs(e.firstAt)).toISOString()
        : null;

    rows.push({
      user_id: input.userId,
      game_id: input.gameId,
      event_type: e.type,
      count,
      metadata: { ...meta, session: input.sessionId },
      window_started_at: clientTs,
    });

    // Serious client events also join the canonical evidence timeline.
    if (weight.severity === "medium" || weight.severity === "high") {
      mirrored.push({
        user_id: input.userId,
        game_id: input.gameId,
        event_type: e.type,
        severity: weight.severity,
        source: "client" satisfies AntiCheatSource,
        metadata: { ...meta, count, session: input.sessionId },
        client_ts: clientTs,
      });
    }

    if (weight.weight > 0) {
      const add = Math.min(weight.weight * count, weight.perBatchCap);
      deltas[weight.category] = (deltas[weight.category] ?? 0) + add;
    }
  }

  if (rows.length > 0) {
    const { error } = await db.from("browser_events").insert(rows);
    if (error) throw new Error(error.message);
  }
  if (mirrored.length > 0) {
    const { error } = await db.from("anti_cheat_events").insert(mirrored);
    if (error) logger.warn("anticheat: evidence mirror insert failed", { error });
  }

  await applyRiskUpdate(input.userId, deltas);
}

// ── Risk score persistence (single writer) ────────────────────────────

export interface RiskUpdateResult {
  previousLevel: RiskLevel;
  level: RiskLevel;
  total: number;
}

/**
 * Decay-then-add update of a player's risk accumulators, recomputing the
 * 0-100 score via risk.ts. All writes to player_risk_scores go through
 * here (and resetRisk below) — no other code path may touch the table.
 */
export async function applyRiskUpdate(
  userId: string,
  deltas: Partial<RawRiskAccumulators>,
  opts?: { flaggedGamesDelta?: number },
): Promise<RiskUpdateResult | null> {
  try {
    const db = await getDb();
    const { data: existing } = await db
      .from("player_risk_scores")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const now = Date.now();
    const priorRaws: RawRiskAccumulators = existing
      ? {
          engine: num(existing.raw_engine),
          timing: num(existing.raw_timing),
          behavior: num(existing.raw_behavior),
          connection: num(existing.raw_connection),
          account: num(existing.raw_account),
        }
      : { ...EMPTY_RAWS };
    const decayedAt = existing?.decayed_at ? new Date(String(existing.decayed_at)).getTime() : now;
    const previousLevel = (existing?.risk_level as RiskLevel | undefined) ?? "safe";

    const raws = applyDeltas(decayRaws(priorRaws, now - decayedAt), deltas);
    const risk = computeRisk(raws);

    const { error } = await db.from("player_risk_scores").upsert(
      {
        user_id: userId,
        total_score: risk.total,
        risk_level: risk.level,
        engine_score: risk.components.engine,
        timing_score: risk.components.timing,
        behavior_score: risk.components.behavior,
        connection_score: risk.components.connection,
        account_score: risk.components.account,
        raw_engine: raws.engine,
        raw_timing: raws.timing,
        raw_behavior: raws.behavior,
        raw_connection: raws.connection,
        raw_account: raws.account,
        flagged_games: Math.max(0, num(existing?.flagged_games) + (opts?.flaggedGamesDelta ?? 0)),
        last_event_at: new Date(now).toISOString(),
        decayed_at: new Date(now).toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);

    const result: RiskUpdateResult = { previousLevel, level: risk.level, total: risk.total };

    // Escalation alert: crossing into review/high_risk wakes the admins.
    const escalated =
      (risk.level === "review" || risk.level === "high_risk") && previousLevel !== risk.level;
    if (escalated) {
      await notifyAdmins(
        `risk:${userId}`,
        risk.level === "high_risk" ? "High-risk player detected" : "Player entered review band",
        `Risk score ${risk.total}/100. Open the anti-cheat dashboard to review the evidence.`,
        `/admin/anticheat?player=${userId}`,
      );
    }
    return result;
  } catch (error) {
    logger.warn("anticheat: risk update failed", { error, userId });
    return null;
  }
}

/** Admin action: zero out a player's risk accumulators (audited by caller). */
export async function resetRisk(userId: string): Promise<void> {
  const db = await getDb();
  const risk = computeRisk({ ...EMPTY_RAWS });
  const { error } = await db.from("player_risk_scores").upsert(
    {
      user_id: userId,
      total_score: risk.total,
      risk_level: risk.level,
      engine_score: 0,
      timing_score: 0,
      behavior_score: 0,
      connection_score: 0,
      account_score: 0,
      raw_engine: 0,
      raw_timing: 0,
      raw_behavior: 0,
      raw_connection: 0,
      raw_account: 0,
      flagged_games: 0,
      decayed_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

// ── Flags ─────────────────────────────────────────────────────────────

export interface FlagInput {
  userId: string;
  gameId: string | null;
  type: FlagType;
  severity: AntiCheatSeverity;
  category: RiskCategory;
  summary: string;
  details: Record<string, unknown>;
}

/**
 * Create review flags for one player (deduped per game+type) and fold
 * their weights into the risk score. Returns how many were created.
 */
export async function createFlags(flags: FlagInput[]): Promise<number> {
  if (flags.length === 0) return 0;
  const db = await getDb();
  let created = 0;
  const deltas: Partial<RawRiskAccumulators> = {};
  const userId = flags[0].userId;

  for (const flag of flags) {
    // Dedupe: an identical non-dismissed flag for the same game+type
    // means this evidence is already awaiting review.
    if (flag.gameId) {
      const { data: dupe } = await db
        .from("anti_cheat_flags")
        .select("id")
        .eq("user_id", flag.userId)
        .eq("game_id", flag.gameId)
        .eq("flag_type", flag.type)
        .not("status", "eq", "dismissed")
        .limit(1)
        .maybeSingle();
      if (dupe) continue;
    }
    const contribution = FLAG_SEVERITY_WEIGHTS[flag.severity];
    const { error } = await db.from("anti_cheat_flags").insert({
      user_id: flag.userId,
      game_id: flag.gameId,
      flag_type: flag.type,
      severity: flag.severity,
      status: "open",
      risk_contribution: contribution,
      summary: flag.summary.slice(0, 500),
      details: flag.details,
    });
    if (error) {
      logger.warn("anticheat: flag insert failed", { error: new Error(error.message) });
      continue;
    }
    created++;
    deltas[flag.category] = (deltas[flag.category] ?? 0) + contribution;
  }

  if (created > 0) {
    await applyRiskUpdate(userId, deltas, { flaggedGamesDelta: 1 });
  }
  return created;
}

// ── Device fingerprints & multi-account detection ─────────────────────

function hashIp(ip: string): string {
  const salt = process.env.ANTICHEAT_IP_SALT ?? process.env.OTP_HASH_SECRET ?? "chessox-anticheat";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export async function registerFingerprint(input: {
  userId: string;
  hash: string;
  components: Record<string, unknown>;
  userAgent: string | null;
  ip: string | null;
}): Promise<void> {
  const db = await getDb();
  const ipHash = input.ip ? hashIp(input.ip) : null;

  const { data: existing } = await db
    .from("device_fingerprints")
    .select("id, times_seen")
    .eq("user_id", input.userId)
    .eq("fingerprint_hash", input.hash)
    .maybeSingle();

  if (existing) {
    await db
      .from("device_fingerprints")
      .update({
        times_seen: num(existing.times_seen) + 1,
        last_seen_at: new Date().toISOString(),
        ip_hash: ipHash,
        components: input.components,
      })
      .eq("id", existing.id as string);
  } else {
    const { error } = await db.from("device_fingerprints").insert({
      user_id: input.userId,
      fingerprint_hash: input.hash,
      components: input.components,
      ip_hash: ipHash,
      user_agent: input.userAgent?.slice(0, 400) ?? null,
    });
    if (error) {
      logger.warn("anticheat: fingerprint insert failed", { error: new Error(error.message) });
      return;
    }
  }

  await checkMultiAccount(db, input.userId, input.hash);
}

/**
 * Same fingerprint across multiple accounts ⇒ flag for review. Explicitly
 * NOT an enforcement signal on its own (families/shared computers exist);
 * it feeds the low-weight "account" category and the admin review queue.
 */
async function checkMultiAccount(db: LooseDb, userId: string, hash: string): Promise<void> {
  try {
    const { data: sharers } = await db
      .from("device_fingerprints")
      .select("user_id")
      .eq("fingerprint_hash", hash)
      .limit(20);
    const others = [...new Set((sharers ?? []).map((r) => String(r.user_id)))].filter(
      (id) => id !== userId,
    );
    if (others.length + 1 < ANTICHEAT_CONFIG.multiAccount.accountsPerDeviceFlag) return;

    // Cooldown: don't re-flag the same user for the same device constantly.
    const cutoff = new Date(
      Date.now() - ANTICHEAT_CONFIG.multiAccount.reflagCooldownHours * 3_600_000,
    ).toISOString();
    const { data: recent } = await db
      .from("anti_cheat_flags")
      .select("id")
      .eq("user_id", userId)
      .eq("flag_type", "multi_account")
      .gte("created_at", cutoff)
      .limit(1)
      .maybeSingle();
    if (recent) return;

    await createFlags([
      {
        userId,
        gameId: null,
        type: "multi_account",
        severity: "medium",
        category: "account",
        summary: `Device fingerprint shared with ${others.length} other account(s)`,
        details: { fingerprint: hash.slice(0, 16), otherAccounts: others.slice(0, 10) },
      },
    ]);
    await notifyAdmins(
      `multiacct:${hash.slice(0, 16)}`,
      "Possible multi-account use",
      `${others.length + 1} accounts share one device fingerprint. Flagged for review — no action taken automatically.`,
      `/admin/anticheat?player=${userId}`,
    );
  } catch (error) {
    logger.warn("anticheat: multi-account check failed", { error });
  }
}

// ── Admin alerting (deduped) ──────────────────────────────────────────

const alertMemo = new Map<string, number>();

export async function notifyAdmins(
  dedupeKey: string,
  title: string,
  body: string,
  link?: string,
): Promise<void> {
  try {
    const now = Date.now();
    const last = alertMemo.get(dedupeKey);
    if (last && now - last < ANTICHEAT_CONFIG.notifications.dedupeWindowMs) return;
    alertMemo.set(dedupeKey, now);
    if (alertMemo.size > 500) {
      for (const [k, t] of alertMemo) {
        if (now - t > ANTICHEAT_CONFIG.notifications.dedupeWindowMs) alertMemo.delete(k);
      }
    }
    const db = await getDb();
    const { error } = await db.rpc("anticheat_notify_admins", {
      p_title: title,
      p_body: body,
      p_link: link ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    logger.warn("anticheat: admin notification failed", { error });
  }
}

// ── Enforcement expiry (opportunistic) ────────────────────────────────

let lastExpirySweep = 0;

/** Lift expired temporary restrictions — at most once a minute per instance. */
export async function maybeExpireEnforcements(): Promise<void> {
  const now = Date.now();
  if (now - lastExpirySweep < 60_000) return;
  lastExpirySweep = now;
  try {
    const db = await getDb();
    await db.rpc("anticheat_expire_enforcements");
  } catch (error) {
    logger.warn("anticheat: enforcement expiry sweep failed", { error });
  }
}

// ── small utils ───────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
}

function boundMeta(
  meta: Record<string, string | number | boolean> | undefined,
  maxChars: number,
): Record<string, string | number | boolean> {
  if (!meta) return {};
  const out: Record<string, string | number | boolean> = {};
  let used = 0;
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
    const str = String(v);
    used += k.length + str.length;
    if (used > maxChars) break;
    out[k.slice(0, 40)] = typeof v === "string" ? v.slice(0, 200) : v;
  }
  return out;
}

function clampTs(ts: number): number {
  // Client timestamps are claims; clamp to ±7 days around now so a
  // manipulated clock can't scatter evidence across the timeline.
  const now = Date.now();
  const week = 7 * 24 * 3_600_000;
  return Math.min(Math.max(ts, now - week), now + week);
}
