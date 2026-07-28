import type { SupabaseClient } from "@supabase/supabase-js";

const HEARTBEAT_MS = 20_000;

export function startPresence(supabase: SupabaseClient, userId: string): () => void {
  const setOnline = (online: boolean) =>
    supabase
      .from("profiles")
      .update({ is_online: online, last_seen: new Date().toISOString() } as never)
      .eq("id", userId)
      .then(() => {});

  // Send initial online ping
  setOnline(true);

  // Periodic heartbeat every 20 seconds
  const heartbeat = setInterval(() => {
    supabase
      .from("profiles")
      .update({ is_online: true, last_seen: new Date().toISOString() } as never)
      .eq("id", userId)
      .then(() => {});
  }, HEARTBEAT_MS);

  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      setOnline(true);
    }
  };

  const handleBeforeUnload = () => {
    setOnline(false);
  };

  window.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("beforeunload", handleBeforeUnload);

  return () => {
    clearInterval(heartbeat);
    window.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("beforeunload", handleBeforeUnload);
    setOnline(false);
  };
}
