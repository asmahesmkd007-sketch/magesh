import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { useAuth } from "./useAuth";

export interface PostWithProfile {
  id: string;
  user_id: string;
  content: string;
  media_url: string | null;
  likes_count: number;
  dislikes_count: number;
  comments_count: number;
  score: number;
  created_at: string;
  updated_at: string;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  user_reaction?: "like" | "dislike" | null;
}

export function useCommunity() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: newestPosts = [], isLoading: isLoadingNewest } = useQuery({
    queryKey: ["community_posts", "newest"],
    queryFn: async () => {
      // Get posts from the last 24 hours, top 10
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const { data, error } = await supabase
        .from("community_posts")
        .select(
          `
          *,
          profiles(username, display_name, avatar_url)
        `,
        )
        .gte("created_at", twentyFourHoursAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as any as PostWithProfile[];
    },
  });

  const { data: trendingPosts = [], isLoading: isLoadingTrending } = useQuery({
    queryKey: ["community_posts", "trending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_posts")
        .select(
          `
          *,
          profiles(username, display_name, avatar_url)
        `,
        )
        .order("score", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as any as PostWithProfile[];
    },
  });

  // Subscribe to real-time changes
  useEffect(() => {
    const channel = supabase
      .channel("community_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_posts" },
        (payload) => {
          // Trigger a refetch to ensure we get the joined profile data correctly
          // In a real production app, we might optimistic update the cache manually
          queryClient.invalidateQueries({ queryKey: ["community_posts"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    newestPosts,
    trendingPosts,
    isLoadingNewest,
    isLoadingTrending,
  };
}
