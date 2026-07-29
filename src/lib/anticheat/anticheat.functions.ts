// =====================================================================
// ANTI-CHEAT — server functions (wire endpoints)
// ---------------------------------------------------------------------
// The authenticated HTTP surface of the anti-cheat system:
//   * reportAntiCheatEvents  — batched client telemetry ingestion
//   * registerDeviceFingerprint — device/browser fingerprint + IP hash
//   * acReviewFlag / acEnforce / acResetRisk — admin mutations (each
//     re-verifies the admin role server-side; the UI check is cosmetic)
// All heavy lifting lives in ingest.server.ts / analysis.server.ts and
// is imported dynamically so none of it leaks into the client bundle.
// =====================================================================

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rateLimit } from "@/lib/rate-limit";

import { ANTICHEAT_CONFIG, FLAG_TYPE_CATEGORIES } from "./config";
import { enforcementAllowed } from "./risk";
import { BROWSER_EVENT_TYPES } from "./types";

// ── Telemetry ingestion ───────────────────────────────────────────────

const metaValue = z.union([z.string().max(200), z.number(), z.boolean()]);
const eventReport = z.object({
  type: z.enum(BROWSER_EVENT_TYPES),
  count: z.number().int().min(1).max(10_000),
  firstAt: z.number().finite(),
  meta: z.record(metaValue).optional(),
});
// min(0): an empty batch is a legitimate "game ended" sync ping that
// still triggers the post-game sweep without fabricating telemetry.
const eventBatch = z.object({
  gameId: z.string().uuid().nullable(),
  sessionId: z.string().min(4).max(64),
  events: z.array(eventReport).max(ANTICHEAT_CONFIG.client.maxEventsPerBatch),
});

export const reportAntiCheatEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(eventBatch)
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    const { limit, windowMs } = ANTICHEAT_CONFIG.server.reportRateLimit;
    if (!rateLimit({ key: `ac-report:${userId}`, limit, windowMs })) {
      // Over-chatty client: drop silently — telemetry is never worth an error.
      return { ok: true };
    }

    const [ingest, analysis] = await Promise.all([
      import("./ingest.server"),
      import("./analysis.server"),
    ]);

    // Ingestion + housekeeping run in the background; the client gets an
    // immediate ack and gameplay is never coupled to these writes.
    if (data.events.length > 0) {
      void ingest
        .ingestClientBatch({
          userId,
          gameId: data.gameId,
          sessionId: data.sessionId,
          events: data.events,
        })
        .catch(() => {});
    }
    void ingest.maybeExpireEnforcements();
    void analysis.sweepRecentGames(userId);

    return { ok: true };
  });

// ── Device fingerprint registration ───────────────────────────────────

const fingerprintInput = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  components: z.record(z.union([z.string().max(300), z.number(), z.boolean(), z.null()])),
});

export const registerDeviceFingerprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(fingerprintInput)
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    const { limit, windowMs } = ANTICHEAT_CONFIG.server.fingerprintRateLimit;
    if (!rateLimit({ key: `ac-fp:${userId}`, limit, windowMs })) return { ok: true };

    const request = getRequest();
    const forwarded = request?.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || request?.headers.get("x-real-ip") || null;
    const userAgent = request?.headers.get("user-agent") ?? null;

    const ingest = await import("./ingest.server");
    void ingest
      .registerFingerprint({ userId, hash: data.hash, components: data.components, userAgent, ip })
      .catch(() => {});
    return { ok: true };
  });

// ── Player reports feed the account risk category ─────────────────────

const reportSignal = z.object({
  reportedUserId: z.string().uuid(),
  reason: z.string().max(200).optional(),
});

/**
 * Record that a player was reported for fair play. Reports are a weak
 * signal by design — one report can never trigger enforcement; it only
 * nudges the "account" category and surfaces in the evidence timeline.
 */
export const noteFairPlayReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(reportSignal)
  .handler(async ({ data, context }) => {
    const reporterId = context.userId as string;
    if (reporterId === data.reportedUserId) return { ok: true };
    // One counted report per reporter→target per day.
    if (
      !rateLimit({
        key: `ac-report-signal:${reporterId}:${data.reportedUserId}`,
        limit: 1,
        windowMs: 86_400_000,
      })
    ) {
      return { ok: true };
    }
    const { recordServerEvents } = await import("./ingest.server");
    void recordServerEvents([
      {
        userId: data.reportedUserId,
        gameId: null,
        type: "report_filed",
        metadata: { reason: data.reason ?? null, reporter: reporterId },
      },
    ]).catch(() => {});
    return { ok: true };
  });

// ── Admin mutations ───────────────────────────────────────────────────

async function requireAdmin(userId: string): Promise<void> {
  const { getDb } = await import("./ingest.server");
  const db = await getDb();
  const { data, error } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || data !== true) throw new Error("Admin only");
}

async function logAdminAction(
  adminId: string,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  // Best-effort: admin_audit_logs exists on the live deployment; absence
  // must not fail the action itself (admin_reviews is the system of record).
  try {
    const { getDb } = await import("./ingest.server");
    const db = await getDb();
    await db.from("admin_audit_logs").insert({
      admin_id: adminId,
      action,
      target_type: "anticheat",
      target_id: targetId,
      metadata,
    });
  } catch {
    /* audit mirror only */
  }
}

const reviewInput = z.object({
  flagId: z.string().uuid(),
  decision: z.enum(["confirm", "dismiss"]),
  notes: z.string().max(2_000).default(""),
});

/** Confirm a flag (evidence verified) or dismiss it as a false positive. */
export const acReviewFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(reviewInput)
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await requireAdmin(adminId);

    const ingest = await import("./ingest.server");
    const db = await ingest.getDb();

    const { data: flag } = await db
      .from("anti_cheat_flags")
      .select("*")
      .eq("id", data.flagId)
      .maybeSingle();
    if (!flag) throw new Error("Flag not found");
    if (flag.status === "dismissed" || flag.status === "confirmed") {
      throw new Error("Flag already reviewed");
    }

    const nextStatus = data.decision === "confirm" ? "confirmed" : "dismissed";
    const { error } = await db
      .from("anti_cheat_flags")
      .update({ status: nextStatus, reviewed_by: adminId, reviewed_at: new Date().toISOString() })
      .eq("id", data.flagId);
    if (error) throw new Error("Failed to update flag");

    // A dismissed flag was a false positive — take its contribution back
    // out of the player's score through the one scoring code path.
    if (data.decision === "dismiss") {
      const category = FLAG_TYPE_CATEGORIES[flag.flag_type as keyof typeof FLAG_TYPE_CATEGORIES];
      const contribution = Number(flag.risk_contribution ?? 0);
      if (category && contribution > 0) {
        await ingest.applyRiskUpdate(String(flag.user_id), { [category]: -contribution });
      }
    }

    await db.from("admin_reviews").insert({
      flag_id: data.flagId,
      user_id: flag.user_id,
      admin_id: adminId,
      decision: data.decision,
      notes: data.notes,
    });
    await logAdminAction(adminId, `anticheat_flag_${data.decision}`, String(flag.user_id), {
      flag_id: data.flagId,
      flag_type: flag.flag_type,
    });
    return { ok: true, status: nextStatus };
  });

const enforceInput = z.object({
  userId: z.string().uuid(),
  action: z.enum(["warning", "restriction", "suspension", "ban", "unban"]),
  reason: z.string().min(3).max(1_000),
  durationHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 365)
    .optional(),
});

/**
 * Apply an enforcement action. The multi-indicator policy from risk.ts
 * is enforced HERE, server-side — the dashboard cannot bypass it: one
 * tab switch, one report or one suspicious move can never produce a
 * suspension/ban.
 */
export const acEnforce = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(enforceInput)
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await requireAdmin(adminId);

    const ingest = await import("./ingest.server");
    const db = await ingest.getDb();

    // Evidence inventory for the false-positive gate.
    const [{ data: activeFlags }, { data: risk }] = await Promise.all([
      db
        .from("anti_cheat_flags")
        .select("flag_type, status")
        .eq("user_id", data.userId)
        .in("status", ["open", "under_review", "confirmed"]),
      db.from("player_risk_scores").select("total_score").eq("user_id", data.userId).maybeSingle(),
    ]);
    const flags = activeFlags ?? [];
    const gate = enforcementAllowed({
      action: data.action,
      totalScore: Number(risk?.total_score ?? 0),
      activeFlagCount: flags.length,
      distinctFlagTypes: new Set(flags.map((f) => String(f.flag_type))).size,
      confirmedFlagCount: flags.filter((f) => f.status === "confirmed").length,
    });
    if (!gate.allowed) throw new Error(gate.reason ?? "Insufficient evidence");

    const expiresAt =
      data.durationHours && (data.action === "restriction" || data.action === "suspension")
        ? new Date(Date.now() + data.durationHours * 3_600_000).toISOString()
        : null;

    const { data: inserted, error } = (await db
      .from("enforcement_actions")
      .insert({
        user_id: data.userId,
        action: data.action,
        reason: data.reason,
        duration_hours: data.durationHours ?? null,
        expires_at: expiresAt,
        created_by: adminId,
      })
      .select("id")
      .limit(1)
      .maybeSingle()) as { data: { id?: string } | null; error: { message: string } | null };
    if (error) throw new Error("Failed to record enforcement action");

    // Account status transition (account_status is the anti-cheat
    // authority; the legacy `status` column is mirrored best-effort for
    // deployments whose admin UI still reads it).
    const statusFor: Record<string, string | null> = {
      warning: null,
      restriction: "restricted",
      suspension: "suspended",
      ban: "banned",
      unban: "active",
    };
    const nextStatus = statusFor[data.action];
    if (nextStatus) {
      const { error: statusErr } = await db
        .from("profiles")
        .update({ account_status: nextStatus })
        .eq("id", data.userId);
      if (statusErr) throw new Error("Failed to update account status");
      try {
        const legacy: Record<string, string> = {
          restricted: "blocked",
          suspended: "suspended",
          banned: "banned",
          active: "active",
        };
        await db.from("profiles").update({ status: legacy[nextStatus] }).eq("id", data.userId);
      } catch {
        /* legacy column not present on this deployment */
      }
    }

    // Tell the player (their notification feed; kind renders unfiltered).
    await notifyPlayer(db, data.userId, data.action, data.reason, expiresAt);

    await db.from("admin_reviews").insert({
      flag_id: null,
      user_id: data.userId,
      admin_id: adminId,
      decision: "enforce",
      notes: `${data.action}: ${data.reason}`,
    });
    await logAdminAction(adminId, `anticheat_${data.action}`, data.userId, {
      reason: data.reason,
      expires_at: expiresAt,
      action_id: inserted?.id ?? null,
    });
    return { ok: true, actionId: inserted?.id ?? null };
  });

async function notifyPlayer(
  db: Awaited<ReturnType<(typeof import("./ingest.server"))["getDb"]>>,
  userId: string,
  action: string,
  reason: string,
  expiresAt: string | null,
): Promise<void> {
  const titles: Record<string, string> = {
    warning: "Fair-play warning",
    restriction: "Account restricted",
    suspension: "Account suspended",
    ban: "Account banned",
    unban: "Account reinstated",
  };
  const body = expiresAt
    ? `${reason} (until ${new Date(expiresAt).toLocaleString("en-IN")})`
    : reason;
  const row = {
    user_id: userId,
    kind: "anticheat_enforcement",
    title: titles[action] ?? "Fair-play notice",
    body,
    link: "/fair-play-policy",
  };
  const { error } = await db.from("notifications").insert(row);
  if (error) {
    // Legacy deployments require NOT NULL type/message columns.
    await db
      .from("notifications")
      .insert({ ...row, type: "anticheat", message: body })
      .then(
        () => undefined,
        () => undefined,
      );
  }
}

const resetInput = z.object({
  userId: z.string().uuid(),
  notes: z.string().max(1_000).default(""),
});

/** Zero a player's risk score (e.g. after a cleared investigation). */
export const acResetRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(resetInput)
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await requireAdmin(adminId);

    const ingest = await import("./ingest.server");
    const db = await ingest.getDb();
    await ingest.resetRisk(data.userId);
    await db.from("enforcement_actions").insert({
      user_id: data.userId,
      action: "risk_reset",
      reason: data.notes || "Risk score reset by admin",
      created_by: adminId,
    });
    await db.from("admin_reviews").insert({
      flag_id: null,
      user_id: data.userId,
      admin_id: adminId,
      decision: "reset_risk",
      notes: data.notes,
    });
    await logAdminAction(adminId, "anticheat_risk_reset", data.userId, {});
    return { ok: true };
  });
