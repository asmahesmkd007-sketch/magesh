import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * pinned_friends and favorite_friends are two identically-shaped tables
 * (id, user_id, friend_id, created_at), each with a simple "auth.uid() =
 * user_id" RLS policy — no RPC needed, direct table ops are safe. This one
 * hook drives both; usePinnedFriends/useFavoriteFriends below just bind
 * the table name so call sites stay readable.
 */
function usePreferenceSet(table: "pinned_friends" | "favorite_friends", userId?: string | null) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase.from(table).select("friend_id").eq("user_id", userId);
    setIds(new Set((data ?? []).map((r) => r.friend_id).filter((id): id is string => !!id)));
    setLoading(false);
  }, [table, userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(friendId: string) {
    if (!userId) return;
    setIds((prev) => new Set(prev).add(friendId));
    const { error } = await supabase.from(table).insert({ user_id: userId, friend_id: friendId });
    if (error) {
      // Roll back optimistic update (e.g. pinned_friends' max-3 trigger fired).
      setIds((prev) => {
        const next = new Set(prev);
        next.delete(friendId);
        return next;
      });
      throw error;
    }
  }

  async function remove(friendId: string) {
    if (!userId) return;
    setIds((prev) => {
      const next = new Set(prev);
      next.delete(friendId);
      return next;
    });
    await supabase.from(table).delete().eq("user_id", userId).eq("friend_id", friendId);
  }

  async function toggle(friendId: string) {
    if (ids.has(friendId)) {
      await remove(friendId);
    } else {
      await add(friendId);
    }
  }

  return { ids, loading, add, remove, toggle };
}

/** Max 3, enforced server-side by the enforce_max_pins trigger. */
export function usePinnedFriends(userId?: string | null) {
  return usePreferenceSet("pinned_friends", userId);
}

/** Unlimited. */
export function useFavoriteFriends(userId?: string | null) {
  return usePreferenceSet("favorite_friends", userId);
}
