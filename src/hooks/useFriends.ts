import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FriendRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
  other_username: string | null;
  other_display: string | null;
  other_avatar_url?: string | null;
  other_premium_active?: boolean;
  other_premium_expires_at?: string | null;
};

export function useFriends(userId?: string | null) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!userId) {
      setFriends([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("friends")
      .select("id,requester_id,addressee_id,status,created_at")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (!data) {
      setFriends([]);
      setLoading(false);
      return;
    }

    // Resolve other user profiles
    // requester/addressee are nullable in the DB only for legacy rows that
    // predate the friends-shape migration; live rows always have both.
    const otherIds = data.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id));
    const uniqueIds = [...new Set(otherIds)].filter((id): id is string => !!id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,username,full_name,avatar_url,premium_active,premium_expires_at")
      .in("id", uniqueIds);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    setFriends(
      data.map((r) => {
        const otherId = r.requester_id === userId ? r.addressee_id : r.requester_id;
        const p = profileMap.get(otherId);
        return {
          ...r,
          other_username: p?.username ?? null,
          other_display: p?.full_name ?? null,
          other_avatar_url: p?.avatar_url ?? null,
          other_premium_active: p?.premium_active,
          other_premium_expires_at: p?.premium_expires_at,
        } as FriendRow;
      }),
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [userId]);

  async function sendRequest(addresseeId: string) {
    if (!userId) return;
    await supabase
      .from("friends")
      .insert({ requester_id: userId, addressee_id: addresseeId } as never);
    await load();
  }

  async function acceptRequest(id: string) {
    await supabase
      .from("friends")
      .update({ status: "accepted" } as never)
      .eq("id", id);
    await load();
  }

  async function declineRequest(id: string) {
    await supabase.from("friends").delete().eq("id", id);
    await load();
  }

  async function removeFriend(id: string) {
    await supabase.from("friends").delete().eq("id", id);
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
