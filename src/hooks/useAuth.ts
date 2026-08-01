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
  state: string | null;
  district: string | null;
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

function startAuthSubscription() {
  // onAuthStateChange fires INITIAL_SESSION on mount with the restored session.
  // Relying on it alone avoids a race where a separate getSession() call briefly
  // sets loading=false with session=null before INITIAL_SESSION fires.
  const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
    const fresh = s?.user ?? null;
    // A token refresh mints a new session (and user) object for the same
    // person. `session` must still update — consumers read the access token
    // off it — but reusing the previous `user` identity keeps every memo and
    // effect keyed on `user` from firing for what is only a new token.
    const user =
      event === "TOKEN_REFRESHED" && fresh && authSnapshot.user?.id === fresh.id
        ? authSnapshot.user
        : fresh;
    authSnapshot = { session: s, user, loading: false };
    for (const listener of authListeners) listener();
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

      if (prof) {
        // Shim for local dev if migration hasn't run yet — some local DBs
        // may still have the pre-rename `display_name` column instead of
        // `full_name`.
        const legacy = prof as unknown as { display_name?: string };
        if (!prof.full_name && legacy.display_name) {
          prof.full_name = legacy.display_name;
        }

        let needsUpdate = false;
        let newFullName = prof.full_name;
        let newUsername = prof.username;

        if (!newFullName || newFullName.toLowerCase().startsWith("player")) {
          // Get email prefix if possible
          const { data: userData } = await supabase.auth.getUser();
          const email = userData.user?.email || "";
          newFullName = email.split("@")[0] || "User";
          needsUpdate = true;
        }

        if (!newUsername || newUsername.toLowerCase().startsWith("player")) {
          const { generateUsername } = await import("@/lib/utils/profile");
          newUsername = generateUsername(newFullName);
          needsUpdate = true;
        }

        if (needsUpdate && profileRepairClaimed.has(userId)) {
          // Another simultaneously-mounted instance already claimed this
          // repair — don't race it with a second, differently-random write.
          needsUpdate = false;
        } else if (needsUpdate) {
          profileRepairClaimed.add(userId);
        }

        if (needsUpdate) {
          let { error } = await supabase
            .from("profiles")
            .update({ full_name: newFullName, username: newUsername })
            .eq("id", userId);

          // Fallback for unmigrated local database — `display_name` isn't
          // part of the generated Profile type, hence the loose client
          // (same pattern as settings-sync.ts / adminClient.ts).
          if (error && error.message.includes("full_name")) {
            const legacyDb = supabase as unknown as {
              from: (t: string) => {
                update: (v: Record<string, unknown>) => {
                  eq: (c: string, v: string) => Promise<{ error: typeof error }>;
                };
              };
            };
            const fallback = await legacyDb
              .from("profiles")
              .update({ display_name: newFullName, username: newUsername })
              .eq("id", userId);
            error = fallback.error;
          }

          if (!error) {
            prof = { ...prof, full_name: newFullName, username: newUsername };
          }
        }
      }

      return prof;
    });
}

export async function signOut() {
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
