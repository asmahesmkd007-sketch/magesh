import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  sendFriendRequest as sendFriendRequestRpc,
  acceptFriendRequest as acceptFriendRequestRpc,
} from "@/lib/api/gameClient";
import type { FriendRow } from "@/types/friend";

export type { FriendRow };

// A profile is "online" if its heartbeat (see src/lib/presence.ts, 60s cadence)
// landed within the last 90s — is_online alone can go stale if a tab is
// killed without firing beforeunload.
const ONLINE_WINDOW_MS = 120_000;

export function isRecentlyOnline(lastSeen?: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_WINDOW_MS;
}

export function useFriends(userId?: string | null) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setFriends([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("friends")
      .select("id,requester_id,addressee_id,status,created_at")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (!data) {
      setFriends([]);
      setLoading(false);
      return;
    }

    const otherIds = data.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id));
    const uniqueIds = [...new Set(otherIds)].filter((id): id is string => !!id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select(
        "id,username,full_name,avatar_url,premium_active,premium_expires_at,country,is_online,last_seen,title",
      )
      .in("id", uniqueIds);

    // Headline rating: the site's rapid rating (matches the default time
    // class used across games/challenges), sourced from the real per-time-
    // class `ratings` table — there is no `profiles.iq_rating` column.
    const { data: ratingRows } =
      uniqueIds.length > 0
        ? await supabase
            .from("ratings")
            .select("user_id,rating")
            .eq("time_class", "rapid")
            .in("user_id", uniqueIds)
        : { data: [] as { user_id: string; rating: number }[] };
    const ratingByPlayer = new Map((ratingRows ?? []).map((r) => [r.user_id, r.rating]));

    // Cheap, read-only lookup against the existing `games` table (publicly
    // selectable) so "Current status" can say "Playing now" instead of just
    // online/offline — no schema changes needed.
    const { data: liveGames } =
      uniqueIds.length > 0
        ? await supabase
            .from("games")
            .select("id,white_id,black_id")
            .eq("status", "active")
            .or(`white_id.in.(${uniqueIds.join(",")}),black_id.in.(${uniqueIds.join(",")})`)
        : { data: [] as { id: string; white_id: string | null; black_id: string | null }[] };
    const activeGameByPlayer = new Map<string, string>();
    for (const g of liveGames ?? []) {
      if (g.white_id) activeGameByPlayer.set(g.white_id, g.id);
      if (g.black_id) activeGameByPlayer.set(g.black_id, g.id);
    }

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    setFriends(
      data.map((r) => {
        const otherId = r.requester_id === userId ? r.addressee_id : r.requester_id;
        const p = profileMap.get(otherId ?? "");
        const online = !!p && (p.is_online || isRecentlyOnline(p.last_seen));
        const activeGameId = (otherId && activeGameByPlayer.get(otherId)) || null;
        return {
          ...r,
          other_id: otherId,
          other_username: p?.username ?? null,
          other_display: p?.full_name ?? null,
          other_avatar_url: p?.avatar_url ?? null,
          other_premium_active: p?.premium_active,
          other_premium_expires_at: p?.premium_expires_at,
          other_country: p?.country ?? null,
          other_rating: (otherId && ratingByPlayer.get(otherId)) ?? 100,
          other_is_online: online,
          other_last_seen: p?.last_seen ?? null,
          other_title: p?.title ?? null,
          other_activity: activeGameId ? "playing" : online ? "online" : "offline",
          other_active_game_id: activeGameId,
        } as FriendRow;
      }),
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: any insert/update/delete touching a row where I'm either
  // side (request sent/accepted/declined/removed by the other person, from
  // either direction) refreshes the list without a manual reload.
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`friends:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friends", filter: `requester_id=eq.${userId}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friends", filter: `addressee_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, load]);

  // Live presence: online/offline transitions for the current friend list
  // arrive as UPDATE events on profiles, not on the friends table itself —
  // without this, going online/offline never re-renders the friend cards.
  useEffect(() => {
    if (!userId || friends.length === 0) return;
    const ch = supabase
      .channel(`friends-presence:${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, friends.length > 0, load]);

  async function sendRequest(addresseeId: string) {
    if (!userId) return;
    await sendFriendRequestRpc(addresseeId);
    await load();
  }

  async function acceptRequest(id: string) {
    await acceptFriendRequestRpc(id);
    await load();
  }

  async function declineRequest(id: string) {
    await supabase.from("friends").delete().eq("id", id);
    await load();
  }

  async function removeFriend(id: string) {
    const removed = friends.find((f) => f.id === id);
    await supabase.from("friends").delete().eq("id", id);
    if (userId && removed) {
      const body = `You removed ${removed.other_display ?? removed.other_username ?? "a friend"}.`;
      await supabase.from("notifications").insert({
        user_id: userId,
        kind: "friend_removed",
        type: "friend_removed",
        title: "Friend removed",
        body,
        message: body,
        link: "/friends",
      });
    }
    await load();
  }

  return {
    friends,
    loading,
    sendRequest,
    acceptRequest,
    declineRequest,
    removeFriend,
    refresh: load,
  };
}
