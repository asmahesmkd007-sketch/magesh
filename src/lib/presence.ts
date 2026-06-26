// Online-presence tracking. Encapsulates the heartbeat + unload wiring so the
// root component doesn't have to stash timers on `window`. Call startPresence
// when a user signs in; call the returned disposer on sign-out / unmount.
import type { SupabaseClient } from "@supabase/supabase-js";

const HEARTBEAT_MS = 60_000;

export function startPresence(supabase: SupabaseClient, userId: string): () => void {
  const setOnline = (online: boolean) =>
    supabase
      .from("profiles")
      .update({ is_online: online, last_seen: new Date().toISOString() } as never)
      .eq("id", userId)
      .then(() => {});

  setOnline(true);
  const heartbeat = setInterval(() => {
    supabase
      .from("profiles")
      .update({ last_seen: new Date().toISOString() } as never)
      .eq("id", userId)
      .then(() => {});
  }, HEARTBEAT_MS);

  const handleBeforeUnload = () => void setOnline(false);
  window.addEventListener("beforeunload", handleBeforeUnload);

  return () => {
    clearInterval(heartbeat);
    window.removeEventListener("beforeunload", handleBeforeUnload);
    void setOnline(false);
  };
}
