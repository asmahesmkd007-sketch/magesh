import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useNotificationCount(userId?: string | null) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }

    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false)
      .then(({ count: c }) => setCount(c ?? 0));

    const ch = supabase
      .channel(`notif_count:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => setCount((c) => c + 1),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("read", false)
            .then(({ count: c }) => setCount(c ?? 0));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  return count;
}
