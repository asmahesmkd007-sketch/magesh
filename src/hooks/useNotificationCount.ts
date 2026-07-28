import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGameSettings } from "@/hooks/useGameSettings";
import { isNotificationKindEnabled } from "@/lib/notificationCategories";

export function useNotificationCount(userId?: string | null) {
  const { settings } = useGameSettings();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }

    const prefs = {
      notify_tournament_starting: settings.notify_tournament_starting,
      notify_challenge_received: settings.notify_challenge_received,
      notify_community: settings.notify_community,
    };

    const refresh = () => {
      supabase
        .from("notifications")
        .select("kind")
        .eq("user_id", userId)
        .eq("read", false)
        .then(({ data }) => {
          const rows = (data ?? []) as { kind: string }[];
          setCount(rows.filter((r) => isNotificationKindEnabled(r.kind, prefs)).length);
        });
    };
    refresh();

    const channelId = `notif_count_${userId}_${Math.random().toString(36).substring(7)}`;
    const ch = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const kind = (payload.new as { kind?: string } | null)?.kind ?? "";
          if (isNotificationKindEnabled(kind, prefs)) setCount((c) => c + 1);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        refresh,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [
    userId,
    settings.notify_tournament_starting,
    settings.notify_challenge_received,
    settings.notify_community,
  ]);

  return count;
}
