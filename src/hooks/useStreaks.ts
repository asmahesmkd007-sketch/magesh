import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Streaks = {
  user_id: string;
  current_login_streak: number;
  best_login_streak: number;
  last_login_date: string | null; // "YYYY-MM-DD"
  current_match_streak: number;
  best_match_streak: number;
  last_match_date: string | null; // "YYYY-MM-DD"
  updated_at: string;
};

// Bypass generated types for the new table
const db = supabase as unknown as {
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
  channel: typeof supabase.channel;
  removeChannel: typeof supabase.removeChannel;
};

export function useStreaks(userId?: string | null) {
  const [streaks, setStreaks] = useState<Streaks | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setStreaks(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    db.from("user_streaks")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setStreaks((data as Streaks) ?? null);
          setLoading(false);
        }
      });

    // Realtime: pick up streak updates triggered by login/game-end
    const channel = supabase
      .channel(`streaks:${userId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "user_streaks",
          filter: `user_id=eq.${userId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (!cancelled) setStreaks(payload.new as Streaks);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { streaks, loading };
}
