import type { TimeClass } from "@/lib/api/gameClient";

export type FriendStatus = "pending" | "accepted" | "blocked";

export interface FriendRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendStatus;
  created_at: string;
  other_id: string;
  other_username: string | null;
  other_display: string | null;
  other_avatar_url?: string | null;
  other_premium_active?: boolean;
  other_premium_expires_at?: string | null;
  other_country?: string | null;
  other_rating?: number | null;
  other_is_online?: boolean;
  other_last_seen?: string | null;
  other_title?: string | null;
  /** Derived, read-only: "playing" when they have a live game in progress. */
  other_activity?: "playing" | "online" | "offline";
  other_active_game_id?: string | null;
  is_pinned?: boolean;
  is_favorite?: boolean;
}

export type FriendSortKey = "online" | "favorites" | "recent" | "alphabetical";

export interface FriendFilters {
  search: string;
  onlineOnly: boolean;
  offlineOnly: boolean;
  favoritesOnly: boolean;
  country: string | null;
  minRating: number | null;
}

export type ChallengeStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";

// Backed by the existing `game_challenges` table (from_user_id/to_user_id/
// timer are its original live columns; the rest were added by the friends
// redesign migration — see supabase/schema.sql).
export interface ChallengeRow {
  id: string;
  from_user_id: string;
  to_user_id: string;
  timer: number;
  time_class: TimeClass;
  time_control: string;
  increment_seconds: number;
  is_rated: boolean;
  status: ChallengeStatus;
  game_id: string | null;
  created_at: string;
  responded_at: string | null;
  other_id: string;
  other_username: string | null;
  other_display: string | null;
  other_avatar_url?: string | null;
  other_rating?: number | null;
}

export type ClanInviteStatus = "pending" | "accepted" | "rejected";

export interface ClanInviteRow {
  id: string;
  clan_id: string;
  inviter_id: string;
  invitee_id: string;
  status: ClanInviteStatus;
  created_at: string;
  clan_name: string | null;
  clan_tag: string | null;
  clan_slug: string | null;
  clan_logo_url?: string | null;
  inviter_username: string | null;
  inviter_display: string | null;
  clan_leader_name?: string | null;
  clan_member_count?: number | null;
}

export interface SearchProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url?: string | null;
  premium_active?: boolean;
  premium_expires_at?: string | null;
  rating?: number | null;
  mutual_count?: number;
}

export interface RecentGameSummary {
  id: string;
  /** Relative to the friend whose drawer/profile this appears in. */
  outcome: "win" | "loss" | "draw";
  opponent_name: string;
  time_class: TimeClass;
  time_control: string;
  ended_at: string | null;
}

export interface FriendAchievement {
  code: string;
  awarded_at: string;
}

export interface FriendProfileBundle {
  ratings: Partial<Record<TimeClass, { rating: number; gamesPlayed: number }>>;
  recentGames: RecentGameSummary[];
  mutualFriends: { id: string; username: string | null; display: string | null }[];
  achievements: FriendAchievement[];
}
