import { useEffect, useState, useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { loadSettingsOnce } from "@/lib/settings/settings-sync";

export type Profile = {
  id: string;
  username: string;
  full_name: string;
  created_at: string;
  bio: string | null;
  country: string | null;
  /** ISO 3166-1 alpha-2. Added with the searchable country selector; null on rows saved before it. */
  country_code: string | null;
  state: string | null;
  district: string | null;
  city: string | null;
  favorite_opening: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  title: string | null;
  premium_tier: "free" | "gold" | "platinum" | "maharaja";
  premium_active: boolean;
  premium_expires_at: string | null;
  subscription_status: string;
  website: string | null;
  youtube_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  season_points?: number | null;
  rung_id?: string | null;
};

// ── Shared auth snapshot ───────────────────────────────────────────────
// `useAuth` is called from 59 modules, and a typical page mounts several of
// them at once (Navbar + route + panels). One `onAuthStateChange`
// subscription per call site meant N websocket-adjacent listeners, N copies
// of the session, and — on every auth event — N separate setState cascades
// with N different `user` object identities, so nothing downstream could
// memoize on `user`.
//
// One subscription now feeds one snapshot. The snapshot object is rebuilt
// only when the session actually changes, so consumers that memoize on
// `user` stay stable across unrelated renders.
type AuthSnapshot = { session: Session | null; user: Session["user"] | null; loading: boolean };

const LOADING_SNAPSHOT: AuthSnapshot = { session: null, user: null, loading: true };
// Stable object for SSR — a fresh one each call would loop useSyncExternalStore.
const SERVER_SNAPSHOT: AuthSnapshot = LOADING_SNAPSHOT;

let authSnapshot: AuthSnapshot = LOADING_SNAPSHOT;
let authUnsubscribe: (() => void) | null = null;
const authListeners = new Set<() => void>();

import { toast } from "sonner";
import {
  clearSessionId,
  getDeviceId,
  getSessionId,
  HEARTBEAT_INTERVAL_MS,
  isSessionLockSuppressed,
} from "@/lib/auth/sessionLock";
import {
  acquireSessionServerFn,
  heartbeatSessionServerFn,
  releaseSessionServerFn,
} from "@/lib/api/session.functions";

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let isRevoking = false;

function startHeartbeatLoop(userId: string) {
  stopHeartbeatLoop();

  const pulse = async () => {
    if (isRevoking) return;
    // A password-recovery session holds no claim on user_sessions, so
    // pulsing would invalidate it. See sessionLock.suppressSessionLock.
    // Re-checked here, not just at startup, because suppression can begin
    // after a loop is already running.
    if (isSessionLockSuppressed()) return;
    try {
      const deviceId = getDeviceId();
      const sessionId = getSessionId();
      const res = await heartbeatSessionServerFn({
        data: { userId, sessionId, deviceId },
      });
      if (!res.valid && res.reason === "SESSION_INVALIDATED" && !isRevoking) {
        isRevoking = true;
        stopHeartbeatLoop();
        clearSessionId();
        await supabase.auth.signOut();
        const isAuthPage =
          typeof window !== "undefined" &&
          (window.location.pathname.startsWith("/auth") ||
            window.location.pathname.startsWith("/login") ||
            window.location.pathname.startsWith("/signup"));
        if (!isAuthPage) {
          toast.error("Your session has ended. Please sign in again.");
          if (typeof window !== "undefined") {
            window.location.href = "/auth";
          }
        }
      }
    } catch {
      // Ignore transient network errors during heartbeat
    }
  };

  heartbeatTimer = setInterval(pulse, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeatLoop() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startAuthSubscription() {
  // onAuthStateChange fires INITIAL_SESSION on mount with the restored session.
  // Relying on it alone avoids a race where a separate getSession() call briefly
  // sets loading=false with session=null before INITIAL_SESSION fires.
  const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
    const fresh = s?.user ?? null;
    const metadataChanged =
      fresh && authSnapshot.user
        ? JSON.stringify(fresh.user_metadata) !== JSON.stringify(authSnapshot.user.user_metadata)
        : false;
    const user =
      event === "TOKEN_REFRESHED" && fresh && authSnapshot.user?.id === fresh.id && !metadataChanged
        ? authSnapshot.user
        : fresh;
    authSnapshot = { session: s, user, loading: false };
    for (const listener of authListeners) listener();
    if (s && s.user && !isSessionLockSuppressed()) {
      startHeartbeatLoop(s.user.id);
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        const deviceId = getDeviceId();
        const sessionId = getSessionId();
        acquireSessionServerFn({
          data: { userId: s.user.id, sessionId, deviceId },
        }).catch(() => {});
      }
    } else {
      stopHeartbeatLoop();
      isRevoking = false;
    }
    if (s && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
      loadSettingsOnce().catch(console.error);
    }
  });
  authUnsubscribe = () => sub.subscription.unsubscribe();
}

function subscribeAuth(listener: () => void): () => void {
  if (authListeners.size === 0) startAuthSubscription();
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
    if (authListeners.size === 0) {
      authUnsubscribe?.();
      authUnsubscribe = null;
    }
  };
}

function getAuthSnapshot(): AuthSnapshot {
  return authSnapshot;
}

function getServerAuthSnapshot(): AuthSnapshot {
  return SERVER_SNAPSHOT;
}

export function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);
}

// useProfile() mounts independently in ~8 places (Navbar, page components,
// etc.) and several are mounted simultaneously — e.g. Navbar + home.tsx both
// on the Home page. For a user whose profile still has a default "Player…"
// name, every simultaneously-mounted instance used to detect the same
// needsUpdate and independently call generateUsername() (which is
// Math.random()-based, so each call produces a *different* value), racing
// to write to profiles.username — visible as username flicker, and any
// write past the first could fail a uniqueness constraint with no retry.
// This module-level set makes the repair single-flight per userId per page
// load: only the first useProfile instance to reach the repair step for a
// given userId performs it: everyone else just displays what they fetched.
const profileRepairClaimed = new Set<string>();

// The same comment above explains why several instances mount at once. Each
// of them also issued its own identical `profiles` round-trip — on the Home
// page that is Navbar + home.tsx fetching the same row twice on every load.
// In-flight requests are now shared, so N simultaneous mounts cost one query.
const profileInFlight = new Map<string, Promise<Profile | null>>();

function fetchProfileOnce(userId: string): Promise<Profile | null> {
  const existing = profileInFlight.get(userId);
  if (existing) return existing;
  const request = loadProfile(userId).finally(() => {
    // Cleared on settle: this dedupes concurrent mounts, it is not a cache,
    // so a later mount (or a re-mount after an edit) still reads fresh data.
    profileInFlight.delete(userId);
  });
  profileInFlight.set(userId, request);
  return request;
}

export function useProfile(userId?: string | null) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    fetchProfileOnce(userId)
      .then((prof) => {
        if (!alive) return;
        setProfile(prof);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setProfile(null);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  return { profile, loading, setProfile };
}

async function loadProfile(userId: string): Promise<Profile | null> {
  return supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle()
    .then(async ({ data }) => {
      let prof = data as Profile | null;

      // Google OAuth metadata for the signed-in user, read from the shared
      // auth snapshot rather than supabase.auth.getUser().
      //
      // getUser() is a network round-trip to /auth/v1/user, and it ran on
      // EVERY profile load — including a logged-out visitor reading someone
      // else's profile, where it round-tripped only to return null. The
      // snapshot already holds the same user object (onAuthStateChange
      // delivers it with user_metadata attached), so this reads the same
      // values without the request.
      //
      // Nothing here is an authorisation decision — the metadata is used to
      // fill in a display name and avatar, and every write below is still
      // gated by RLS on `profiles` plus the `authUser.id === userId` check.
      // So dropping the server revalidation costs no security.
      const authUser = authSnapshot.user;
      const meta = authUser?.user_metadata;
      const googleAvatar = (meta?.avatar_url || meta?.picture) as string | undefined;

      if (!prof && authUser && authUser.id === userId) {
        const email = authUser.email || "";
        const fullName = (meta?.full_name || meta?.name || email.split("@")[0] || "User") as string;
        const { generateUsername } = await import("@/lib/utils/profile");
        const username = generateUsername(fullName);
        const newProf = {
          id: userId,
          username,
          full_name: fullName,
          avatar_url: googleAvatar || null,
        };
        const { data: created } = await (supabase as any)
          .from("profiles")
          .insert(newProf)
          .select("*")
          .maybeSingle();
        if (created) prof = created as Profile;
      }

      if (prof) {
        // Shim for local dev if migration hasn't run yet
        const legacy = prof as unknown as { display_name?: string };
        if (!prof.full_name && legacy.display_name) {
          prof.full_name = legacy.display_name;
        }

        let needsUpdate = false;
        let newFullName = prof.full_name;
        let newUsername = prof.username;
        let newAvatarUrl = prof.avatar_url;

        const googleName = (meta?.full_name || meta?.name) as string | undefined;

        if (
          !newFullName ||
          newFullName.toLowerCase().startsWith("player") ||
          (googleName &&
            (newFullName === newUsername || newFullName === authUser?.email?.split("@")[0]))
        ) {
          if (googleName) {
            newFullName = googleName;
            needsUpdate = true;
          } else {
            const email = authUser?.email || "";
            newFullName = email.split("@")[0] || "User";
            needsUpdate = true;
          }
        }

        if (!newUsername || newUsername.toLowerCase().startsWith("player")) {
          const { generateUsername } = await import("@/lib/utils/profile");
          newUsername = generateUsername(newFullName);
          needsUpdate = true;
        }

        // Priority rules:
        // Custom uploaded avatar (e.g. Supabase Storage / non-Google) -> KEEP IT!
        // Google avatar -> Sync if current avatar is null or an outdated Google URL.
        const currentAvatar = prof.avatar_url;
        const isCustomUploaded =
          currentAvatar &&
          !currentAvatar.includes("googleusercontent.com") &&
          !currentAvatar.includes("google.com");

        if (!isCustomUploaded && googleAvatar && googleAvatar !== currentAvatar) {
          newAvatarUrl = googleAvatar;
          needsUpdate = true;
        }

        if (needsUpdate && profileRepairClaimed.has(userId)) {
          needsUpdate = false;
        } else if (needsUpdate) {
          profileRepairClaimed.add(userId);
        }

        if (needsUpdate) {
          const updatePayload: Record<string, unknown> = {
            full_name: newFullName,
            username: newUsername,
            avatar_url: newAvatarUrl,
          };

          const { error } = await (supabase as any)
            .from("profiles")
            .update(updatePayload)
            .eq("id", userId);

          if (!error) {
            prof = {
              ...prof,
              full_name: newFullName,
              username: newUsername,
              avatar_url: newAvatarUrl,
            };
          }
        }
      }

      return prof;
    });
}

export async function signOut() {
  const user = authSnapshot.user;
  const sessionId = getSessionId();
  stopHeartbeatLoop();
  if (user && sessionId) {
    try {
      await releaseSessionServerFn({ data: { userId: user.id, sessionId } });
    } catch {
      // Ignore release errors
    }
  }
  clearSessionId();
  await supabase.auth.signOut();
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
