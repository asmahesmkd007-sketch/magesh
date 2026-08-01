import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  sendChallenge as sendChallengeRpc,
  respondChallenge as respondChallengeRpc,
  cancelChallenge as cancelChallengeRpc,
  type ChallengeOptions,
} from "@/lib/api/gameClient";
import type { ChallengeRow } from "@/types/friend";

export function useChallenges(userId?: string | null) {
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setChallenges([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("game_challenges")
      .select(
        "id,from_user_id,to_user_id,timer,time_class,time_control,increment_seconds,is_rated,status,game_id,created_at,responded_at",
      )
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (!data) {
      setChallenges([]);
      setLoading(false);
      return;
    }

    const otherIds = data.map((r) => (r.from_user_id === userId ? r.to_user_id : r.from_user_id));
    const uniqueIds = [...new Set(otherIds)];
    const [{ data: profiles }, { data: ratingRows }] = await Promise.all([
      supabase.from("profiles").select("id,username,full_name,avatar_url").in("id", uniqueIds),
      uniqueIds.length > 0
        ? supabase.from("ratings").select("user_id,time_class,rating").in("user_id", uniqueIds)
        : Promise.resolve({
          data: [] as { user_id: string; time_class: string; rating: number }[],
        }),
    ]);
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const ratingMap = new Map(
      (ratingRows ?? []).map((r) => [`${r.user_id}:${r.time_class}`, r.rating]),
    );

    setChallenges(
      data.map((r) => {
        const otherId = r.from_user_id === userId ? r.to_user_id : r.from_user_id;
        const p = profileMap.get(otherId);
        return {
          ...r,
          other_id: otherId,
          other_username: p?.username ?? null,
          other_display: p?.full_name ?? null,
          other_avatar_url: p?.avatar_url ?? null,
          other_rating: ratingMap.get(`${otherId}:${r.time_class}`) ?? 100,
        } as ChallengeRow;
      }),
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`challenges:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_challenges",
          filter: `from_user_id=eq.${userId}`,
        },
        () => load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_challenges",
          filter: `to_user_id=eq.${userId}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, load]);

  async function sendChallenge(opponentId: string, opts: Omit<ChallengeOptions, "hostColor">) {
    const id = await sendChallengeRpc({ ...opts, hostColor: "random", opponentId });
    await load();
    return id;
  }

  async function respond(id: string, accept: boolean) {
    const gameId = await respondChallengeRpc(id, accept);
    await load();
    return gameId;
  }

  async function cancel(id: string) {
    await cancelChallengeRpc(id);
    await load();
  }

  const incoming = challenges.filter((c) => c.to_user_id === userId && c.status === "pending");
  const outgoing = challenges.filter((c) => c.from_user_id === userId && c.status === "pending");

  return { challenges, incoming, outgoing, loading, sendChallenge, respond, cancel, refresh: load };
}
