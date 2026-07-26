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
const ONLINE_WINDOW_MS = 90_000;

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
        "id,username,full_name,avatar_url,premium_active,premium_expires_at,country,iq_rating,is_online,last_seen",
      )
      .in("id", uniqueIds);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    setFriends(
      data.map((r) => {
        const otherId = r.requester_id === userId ? r.addressee_id : r.requester_id;
        const p = profileMap.get(otherId);
        return {
          ...r,
          other_id: otherId,
          other_username: p?.username ?? null,
          other_display: p?.full_name ?? null,
          other_avatar_url: p?.avatar_url ?? null,
          other_premium_active: p?.premium_active,
          other_premium_expires_at: p?.premium_expires_at,
          other_country: p?.country ?? null,
          other_rating: p?.iq_rating ?? null,
          other_is_online: !!p?.is_online && isRecentlyOnline(p?.last_seen),
          other_last_seen: p?.last_seen ?? null,
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
      await supabase.from("notifications").insert({
        user_id: userId,
        kind: "friend_removed",
        title: "Friend removed",
        body: `You removed ${removed.other_display ?? removed.other_username ?? "a friend"}.`,
        link: "/friends",
      } as never);
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
