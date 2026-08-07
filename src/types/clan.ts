export type ClanPrivacy = "public" | "private" | "invite_only";
export type ClanRole = "leader" | "co_leader" | "member";

export type ClanSummary = {
  id: string;
  slug: string;
  name: string;
  tag: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  country: string;
  language: string;
  privacy: ClanPrivacy;
  max_members: number;
  member_count: number;
  clan_rating: number;
  clan_score: number;
  war_wins: number;
  war_losses: number;
  war_draws: number;
  total_wars: number;
  clan_level: number;
  clan_xp: number;
  created_at: string;
  global_rank: number;
};

export type Clan = ClanSummary;

export type ClanMemberProfile = {
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  iq_level: number | null;
  season_points?: number | null;
  is_online?: boolean;
  last_seen?: string | null;
  premium_active?: boolean;
  premium_expires_at?: string | null;
};

export type ClanMember = {
  id: string;
  user_id: string;
  role: ClanRole;
  war_points: number;
  joined_at: string;
  last_read_at: string;
  profiles: ClanMemberProfile | null;
};

export type ClanAward = {
  id: string;
  clan_id: string;
  title: string;
  description: string | null;
  icon: string | null;
  awarded_at: string;
};

export type ClanJoinRequest = {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  profiles: { username: string; avatar_url: string | null } | null;
};

export type ClanChatMessage = {
  id: string;
  sender_id: string;
  content: string;
  content_type: "text" | "system";
  reply_to: string | null;
  created_at: string;
  profiles?: {
    username: string;
    display_name?: string | null;
    full_name?: string | null;
    avatar_url: string | null;
  } | null;
};

export type ClanWarStatus = "pending" | "accepted" | "active" | "finished";

export type ClanWar = {
  id: string;
  challenger_clan_id: string;
  defender_clan_id: string;
  status: ClanWarStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  challenger: { name: string; tag: string; slug: string };
  defender: { name: string; tag: string; slug: string };
};

export type ClanActivityType =
  | "created"
  | "joined"
  | "left"
  | "kicked"
  | "promoted"
  | "demoted"
  | "edited"
  | "transferred"
  | "request_approved"
  | "request_rejected"
  | "war_declared"
  | "war_started"
  | "war_declined"
  | "war_finished";

export type ClanActivity = {
  id: string;
  clan_id: string;
  actor_id: string | null;
  target_id: string | null;
  type: ClanActivityType;
  meta: Record<string, unknown>;
  created_at: string;
  actor: { username: string; avatar_url: string | null } | null;
  target: { username: string; avatar_url: string | null } | null;
};
