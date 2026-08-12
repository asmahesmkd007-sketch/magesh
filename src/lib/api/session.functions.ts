import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SESSION_TIMEOUT_SECONDS } from "@/lib/auth/sessionLock";

const acquireSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().min(1),
  deviceId: z.string().min(1),
  timeoutSeconds: z.number().int().positive().optional().default(SESSION_TIMEOUT_SECONDS),
});

const heartbeatSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().min(1),
  deviceId: z.string().min(1),
  timeoutSeconds: z.number().int().positive().optional().default(SESSION_TIMEOUT_SECONDS),
});

const releaseSchema = z.object({
  userId: z.string().uuid(),
  /**
   * Omitted means "release whatever session this user holds", used after a
   * password reset revokes every session globally. Without it the row for
   * the device that was signed out stays is_active, and the next login is
   * refused as ALREADY_LOGGED_IN until it goes stale.
   */
  sessionId: z.string().min(1).optional(),
});

export type AcquireSessionResult = {
  ok: boolean;
  status: "ACQUIRED" | "ALREADY_LOGGED_IN";
  message?: string;
  sessionId?: string;
  deviceId?: string;
};

export type HeartbeatSessionResult = {
  valid: boolean;
  reason?: "NO_SESSION" | "SESSION_INVALIDATED";
};

// In-memory session store fallback for local test environments without live Supabase connection
const localSessionStore = new Map<
  string,
  { sessionId: string; deviceId: string; lastSeen: number; isActive: boolean }
>();

function getAdminClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * Handler logic for acquiring active session.
 */
export async function acquireSessionHandler(data: {
  userId: string;
  sessionId: string;
  deviceId: string;
  timeoutSeconds?: number;
}): Promise<AcquireSessionResult> {
  const timeoutSeconds = data.timeoutSeconds ?? SESSION_TIMEOUT_SECONDS;
  const admin = getAdminClient();

  if (admin) {
    try {
      const { data: rpcRes, error: rpcErr } = await admin.rpc("acquire_user_session", {
        p_user_id: data.userId,
        p_session_id: data.sessionId,
        p_device_id: data.deviceId,
        p_timeout_seconds: timeoutSeconds,
      });

      if (!rpcErr && rpcRes) {
        return rpcRes as AcquireSessionResult;
      }

      // Fallback: Query/upsert directly on user_sessions table via admin client
      const cutoff = new Date(Date.now() - timeoutSeconds * 1000).toISOString();
      const { data: existing } = await admin
        .from("user_sessions")
        .select("*")
        .eq("user_id", data.userId)
        .maybeSingle();

      if (existing) {
        const isRecentlyActive =
          existing.is_active && new Date(existing.last_seen).getTime() > new Date(cutoff).getTime();
        if (isRecentlyActive) {
          const isSameDevice =
            existing.device_id === data.deviceId || existing.session_id === data.sessionId;
          if (!isSameDevice) {
            return {
              ok: false,
              status: "ALREADY_LOGGED_IN",
              message:
                "This user is already logged in on another device. Please log out from the other device or wait until that session expires.",
            };
          }
        }
      }

      const nowIso = new Date().toISOString();
      const expiresIso = new Date(Date.now() + timeoutSeconds * 1000).toISOString();
      await admin.from("user_sessions").upsert(
        {
          user_id: data.userId,
          session_id: data.sessionId,
          device_id: data.deviceId,
          last_seen: nowIso,
          expires_at: expiresIso,
          is_active: true,
          updated_at: nowIso,
        },
        { onConflict: "user_id" },
      );

      return {
        ok: true,
        status: "ACQUIRED",
        sessionId: data.sessionId,
        deviceId: data.deviceId,
      };
    } catch (err) {
      console.error("[acquireSessionHandler] Error:", err);
    }
  }

  // In-Memory Fallback for test runner & offline dev mode
  const now = Date.now();
  const cutoffMs = now - timeoutSeconds * 1000;
  const existing = localSessionStore.get(data.userId);

  if (existing && existing.isActive && existing.lastSeen > cutoffMs) {
    if (existing.deviceId !== data.deviceId && existing.sessionId !== data.sessionId) {
      return {
        ok: false,
        status: "ALREADY_LOGGED_IN",
        message:
          "This user is already logged in on another device. Please log out from the other device or wait until that session expires.",
      };
    }
  }

  localSessionStore.set(data.userId, {
    sessionId: data.sessionId,
    deviceId: data.deviceId,
    lastSeen: now,
    isActive: true,
  });

  return {
    ok: true,
    status: "ACQUIRED",
    sessionId: data.sessionId,
    deviceId: data.deviceId,
  };
}

/**
 * Handler logic for heartbeat.
 */
export async function heartbeatSessionHandler(data: {
  userId: string;
  sessionId: string;
  deviceId: string;
  timeoutSeconds?: number;
}): Promise<HeartbeatSessionResult> {
  const timeoutSeconds = data.timeoutSeconds ?? SESSION_TIMEOUT_SECONDS;
  const admin = getAdminClient();

  if (admin) {
    try {
      const { data: rpcRes, error: rpcErr } = await admin.rpc("heartbeat_user_session", {
        p_user_id: data.userId,
        p_session_id: data.sessionId,
        p_device_id: data.deviceId,
        p_timeout_seconds: timeoutSeconds,
      });

      if (!rpcErr && rpcRes) {
        return rpcRes as HeartbeatSessionResult;
      }

      const { data: existing } = await admin
        .from("user_sessions")
        .select("*")
        .eq("user_id", data.userId)
        .maybeSingle();

      if (!existing || existing.session_id !== data.sessionId || !existing.is_active) {
        return { valid: false, reason: "SESSION_INVALIDATED" };
      }

      const nowIso = new Date().toISOString();
      const expiresIso = new Date(Date.now() + timeoutSeconds * 1000).toISOString();
      await admin
        .from("user_sessions")
        .update({ last_seen: nowIso, expires_at: expiresIso, updated_at: nowIso })
        .eq("user_id", data.userId)
        .eq("session_id", data.sessionId);

      return { valid: true };
    } catch (err) {
      console.error("[heartbeatSessionHandler] Error:", err);
    }
  }

  // In-memory fallback
  const existing = localSessionStore.get(data.userId);
  if (!existing || existing.sessionId !== data.sessionId || !existing.isActive) {
    return { valid: false, reason: "SESSION_INVALIDATED" };
  }

  existing.lastSeen = Date.now();
  return { valid: true };
}

/**
 * Handler logic for session release.
 */
export async function releaseSessionHandler(data: {
  userId: string;
  sessionId?: string;
}): Promise<{ released: boolean }> {
  const admin = getAdminClient();

  if (admin) {
    try {
      if (data.sessionId) {
        await admin.rpc("release_user_session", {
          p_user_id: data.userId,
          p_session_id: data.sessionId,
        });
      }

      // user_sessions holds one row per user (upsert on user_id), so
      // filtering by user alone releases "whatever they hold".
      let update = admin
        .from("user_sessions")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("user_id", data.userId);
      if (data.sessionId) update = update.eq("session_id", data.sessionId);
      await update;
    } catch (err) {
      console.error("[releaseSessionHandler] Error:", err);
    }
  }

  const existing = localSessionStore.get(data.userId);
  if (existing && (!data.sessionId || existing.sessionId === data.sessionId)) {
    existing.isActive = false;
  }

  return { released: true };
}

// TanStack Start Server Functions (wrapped handlers for HTTP API / RPC calls)
export const acquireSessionServerFn = createServerFn({ method: "POST" })
  .inputValidator(acquireSchema)
  .handler(async ({ data }) => acquireSessionHandler(data));

export const heartbeatSessionServerFn = createServerFn({ method: "POST" })
  .inputValidator(heartbeatSchema)
  .handler(async ({ data }) => heartbeatSessionHandler(data));

export const releaseSessionServerFn = createServerFn({ method: "POST" })
  .inputValidator(releaseSchema)
  .handler(async ({ data }) => releaseSessionHandler(data));
