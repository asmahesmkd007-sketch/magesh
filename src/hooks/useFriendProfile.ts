import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FriendProfileBundle, RecentGameSummary } from "@/types/friend";
import type { TimeClass } from "@/lib/api/gameClient";

/**
 * On-demand bundle for the Friend Profile Drawer: per-time-class ratings,
 * recent finished games, mutual friends (via the same `friends` table the
 * rest of the module uses), and community achievements. All read-only,
 * all against existing public-readable tables — nothing new to migrate.
 */
export function useFriendProfile(myUserId: string | undefined | null, friendId: string | null) {
  const [data, setData] = useState<FriendProfileBundle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!friendId || !myUserId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);

    Promise.all([
      supabase.from("ratings").select("time_class,rating,games_played").eq("user_id", friendId),
      supabase
        .from("games")
        .select(
          "id,white_id,black_id,white_username,black_username,result,time_class,time_control,ended_at",
        )
        .or(`white_id.eq.${friendId},black_id.eq.${friendId}`)
        .not("ended_at", "is", null)
        .in("result", ["white", "black", "draw"])
        .order("ended_at", { ascending: false })
        .limit(10),
      // Mutual friends: people who are accepted friends with both me and them.
      supabase
        .from("friends")
        .select("requester_id,addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${myUserId},addressee_id.eq.${myUserId}`),
      supabase
        .from("friends")
        .select("requester_id,addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${friendId},addressee_id.eq.${friendId}`),
      supabase.from("community_achievements").select("code,awarded_at").eq("user_id", friendId),
    ]).then(async ([ratingsRes, gamesRes, myFriendsRes, theirFriendsRes, achievementsRes]) => {
      if (cancelled) return;

      const ratings: FriendProfileBundle["ratings"] = {};
      for (const r of ratingsRes.data ?? []) {
        ratings[r.time_class as TimeClass] = { rating: r.rating, gamesPlayed: r.games_played };
      }

      const recentGames: RecentGameSummary[] = (gamesRes.data ?? []).map((g) => {
        const friendIsWhite = g.white_id === friendId;
        const opponent_name = (friendIsWhite ? g.black_username : g.white_username) ?? "Unknown";
        const outcome: RecentGameSummary["outcome"] =
          g.result === "draw"
            ? "draw"
            : g.result === (friendIsWhite ? "white" : "black")
              ? "win"
              : "loss";
        return {
          id: g.id,
          outcome,
          opponent_name,
          time_class: g.time_class,
          time_control: g.time_control,
          ended_at: g.ended_at,
        };
      });

      const myIds = new Set(
        (myFriendsRes.data ?? []).map((f) =>
          f.requester_id === myUserId ? f.addressee_id : f.requester_id,
        ),
      );
      const theirIds = new Set(
        (theirFriendsRes.data ?? [])
          .map((f) => (f.requester_id === friendId ? f.addressee_id : f.requester_id))
          .filter((id): id is string => !!id && id !== myUserId),
      );
      const mutualIds = [...theirIds].filter((id) => myIds.has(id));

      let mutualFriends: FriendProfileBundle["mutualFriends"] = [];
      if (mutualIds.length > 0) {
        const { data: mutualProfiles } = await supabase
          .from("profiles")
          .select("id,username,full_name")
          .in("id", mutualIds);
        mutualFriends = (mutualProfiles ?? []).map((p) => ({
          id: p.id,
          username: p.username,
          display: p.full_name,
        }));
      }

      if (cancelled) return;
      setData({
        ratings,
        recentGames,
        mutualFriends,
        achievements: achievementsRes.data ?? [],
      });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [myUserId, friendId]);

  return { data, loading };
}
