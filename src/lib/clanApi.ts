import { supabase } from "@/integrations/supabase/client";
import { clanDb } from "@/lib/clanDb";
import type {
  Clan,
  ClanActivity,
  ClanAward,
  ClanChatMessage,
  ClanJoinRequest,
  ClanMember,
  ClanPrivacy,
  ClanSummary,
  ClanWar,
} from "@/types/clan";

/**
 * Clan service layer. Every clan database access in the app goes through
 * here so queries, validation, and error normalization live in one place.
 * All privileged mutations run through SECURITY DEFINER RPCs defined in
 * supabase/schema.sql (Section 28); reads go through RLS-protected tables
 * and the live clan_leaderboard view. Sending a chat message is the only
 * direct INSERT — everything else that mutates state goes through an RPC
 * so validation, activity logging, and notifications stay server-side.
 */

export class ClanApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClanApiError";
  }
}

function fail(error: { message?: string } | null, fallback: string): never {
  throw new ClanApiError(error?.message || fallback);
}

// ---------------------------------------------------------------- validation

export type CreateClanInput = {
  name: string;
  tag: string;
  description: string;
  country: string;
  language: string;
  privacy: ClanPrivacy;
  logoFile: File | null;
  bannerFile: File | null;
};

export type UpdateClanInput = Partial<Omit<CreateClanInput, "tag">>;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateClanInput(input: {
  name?: string;
  tag?: string;
  logoFile?: File | null;
  bannerFile?: File | null;
}): string | null {
  if (input.name !== undefined && (input.name.trim().length < 3 || input.name.trim().length > 20)) {
    return "Clan name must be between 3 and 20 characters.";
  }
  if (input.tag !== undefined && !/^[A-Z0-9]{3,5}$/.test(input.tag)) {
    return "Clan tag must be 3–5 uppercase letters or numbers.";
  }
  if (input.logoFile && input.logoFile.size > MAX_IMAGE_BYTES) return "Logo must be less than 5MB.";
  if (input.bannerFile && input.bannerFile.size > MAX_IMAGE_BYTES)
    return "Banner must be less than 5MB.";
  return null;
}

async function uploadClanImage(
  userId: string,
  kind: "logo" | "banner",
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/clan_${kind}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
  if (error) fail(error, `Failed to upload clan ${kind}`);
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

const MEMBER_PROFILE_FIELDS =
  "username,full_name,avatar_url,iq_level,is_online,last_seen,premium_active,premium_expires_at";

// --------------------------------------------------------------------- reads

export type ClanSort = "score" | "members" | "rating" | "newest";

export async function listClans(
  opts: {
    search?: string;
    sort?: ClanSort;
    country?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ clans: ClanSummary[]; total: number }> {
  const { search = "", sort = "score", country, limit = 24, offset = 0 } = opts;
  let q = clanDb.from("clan_leaderboard").select("*", { count: "exact" });

  if (search.trim()) {
    const term = search.trim().replace(/[%_]/g, "");
    q = q.or(`name.ilike.%${term}%,tag.ilike.%${term}%`);
  }
  if (country && country !== "all") {
    q = q.eq("country", country);
  }

  switch (sort) {
    case "members":
      q = q.order("member_count", { ascending: false });
      break;
    case "rating":
      q = q.order("clan_rating", { ascending: false });
      break;
    case "newest":
      q = q.order("created_at", { ascending: false });
      break;
    default:
      q = q.order("global_rank", { ascending: true });
  }

  const { data, error, count } = await q.range(offset, offset + limit - 1);
  if (error) fail(error, "Failed to load clans");
  return { clans: (data ?? []) as ClanSummary[], total: count ?? 0 };
}

export async function getClanBySlug(slug: string): Promise<Clan | null> {
  const { data, error } = await clanDb
    .from("clan_leaderboard")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail(error, "Failed to load clan");
  return (data as Clan) ?? null;
}

export async function getClanMembers(clanId: string): Promise<ClanMember[]> {
  const { data, error } = await clanDb
    .from("clan_members")
    .select(`id,user_id,role,war_points,joined_at,last_read_at,profiles(${MEMBER_PROFILE_FIELDS})`)
    .eq("clan_id", clanId)
    .order("joined_at", { ascending: true })
    .limit(50);
  if (error) fail(error, "Failed to load members");
  return (data ?? []) as ClanMember[];
}

export async function getClanAwards(clanId: string): Promise<ClanAward[]> {
  const { data, error } = await clanDb
    .from("clan_awards")
    .select("id,clan_id,title,description,icon,awarded_at")
    .eq("clan_id", clanId)
    .order("awarded_at", { ascending: false });
  if (error) fail(error, "Failed to load awards");
  return (data ?? []) as ClanAward[];
}

export async function getJoinRequests(clanId: string): Promise<ClanJoinRequest[]> {
  const { data, error } = await clanDb
    .from("clan_join_requests")
    .select("id,user_id,message,created_at,profiles(username,avatar_url)")
    .eq("clan_id", clanId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) fail(error, "Failed to load join requests");
  return (data ?? []) as ClanJoinRequest[];
}

export async function getMyPendingRequest(clanId: string, userId: string): Promise<boolean> {
  const { data, error } = await clanDb
    .from("clan_join_requests")
    .select("id")
    .eq("clan_id", clanId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) return false;
  return !!data;
}

export async function getClanWars(clanId: string): Promise<ClanWar[]> {
  const { data, error } = await clanDb
    .from("clan_wars")
    .select(
      `id, challenger_clan_id, defender_clan_id, status, starts_at, ends_at, created_at,
       challenger:clans!challenger_clan_id(name, tag, slug),
       defender:clans!defender_clan_id(name, tag, slug)`,
    )
    .or(`challenger_clan_id.eq.${clanId},defender_clan_id.eq.${clanId}`)
    .order("created_at", { ascending: false });
  if (error) fail(error, "Failed to load wars");
  return (data ?? []) as ClanWar[];
}

export async function getClanActivity(clanId: string, limit = 30): Promise<ClanActivity[]> {
  const { data, error } = await clanDb
    .from("clan_activity")
    .select(
      "id,clan_id,actor_id,target_id,type,meta,created_at,actor:profiles!actor_id(username,avatar_url),target:profiles!target_id(username,avatar_url)",
    )
    .eq("clan_id", clanId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail(error, "Failed to load activity");
  return (data ?? []) as ClanActivity[];
}

export async function searchClansByName(query: string, excludeClanId?: string) {
  const term = query.trim().replace(/[%_]/g, "");
  let q = clanDb.from("clans").select("id, name, tag, slug").ilike("name", `%${term}%`).limit(5);
  if (excludeClanId) q = q.neq("id", excludeClanId);
  const { data, error } = await q;
  if (error) fail(error, "Search failed");
  return (data ?? []) as { id: string; name: string; tag: string; slug: string }[];
}

export async function getChatMessages(clanId: string): Promise<ClanChatMessage[]> {
  const { data, error } = await clanDb
    .from("clan_messages")
    .select("id,sender_id,content,content_type,reply_to,created_at,profiles(username,avatar_url)")
    .eq("clan_id", clanId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(150);
  if (error) fail(error, "Failed to load chat");
  return (data ?? []) as ClanChatMessage[];
}

// ----------------------------------------------------------------- mutations

export async function createClan(userId: string, input: CreateClanInput): Promise<Clan> {
  const invalid = validateClanInput(input);
  if (invalid) throw new ClanApiError(invalid);

  const [logoUrl, bannerUrl] = await Promise.all([
    input.logoFile ? uploadClanImage(userId, "logo", input.logoFile) : Promise.resolve(""),
    input.bannerFile ? uploadClanImage(userId, "banner", input.bannerFile) : Promise.resolve(""),
  ]);

  const { data: clanId, error } = await clanDb.rpc("clan_create", {
    p_name: input.name.trim(),
    p_tag: input.tag,
    p_description: input.description.trim(),
    p_country: input.country.trim() || "International",
    p_language: input.language.trim() || "English",
    p_privacy: input.privacy,
    p_logo_url: logoUrl,
    p_banner_url: bannerUrl,
  });
  if (error) fail(error, "Failed to create clan");

  const { data, error: fetchError } = await clanDb
    .from("clan_leaderboard")
    .select("*")
    .eq("id", clanId)
    .single();
  if (fetchError) fail(fetchError, "Clan created but could not be loaded");
  return data as Clan;
}

export async function updateClan(
  userId: string,
  clanId: string,
  input: UpdateClanInput,
): Promise<void> {
  const invalid = validateClanInput(input);
  if (invalid) throw new ClanApiError(invalid);

  const [logoUrl, bannerUrl] = await Promise.all([
    input.logoFile ? uploadClanImage(userId, "logo", input.logoFile) : Promise.resolve(null),
    input.bannerFile ? uploadClanImage(userId, "banner", input.bannerFile) : Promise.resolve(null),
  ]);

  const { error } = await clanDb.rpc("clan_update_details", {
    p_clan_id: clanId,
    p_name: input.name?.trim() ?? null,
    p_description: input.description ?? null,
    p_country: input.country?.trim() ?? null,
    p_language: input.language?.trim() ?? null,
    p_privacy: input.privacy ?? null,
    p_logo_url: logoUrl,
    p_banner_url: bannerUrl,
  });
  if (error) fail(error, "Failed to update clan");
}

export async function joinClan(clanId: string): Promise<"joined" | "requested"> {
  const { data, error } = await clanDb.rpc("clan_request_join", { p_clan_id: clanId });
  if (error) fail(error, "Could not join clan");
  return data as "joined" | "requested";
}

export async function cancelJoinRequest(clanId: string): Promise<void> {
  const { error } = await clanDb.rpc("clan_cancel_join_request", { p_clan_id: clanId });
  if (error) fail(error, "Could not cancel join request");
}

export async function leaveClan(clanId: string): Promise<void> {
  const { error } = await clanDb.rpc("clan_leave", { p_clan_id: clanId });
  if (error) fail(error, "Could not leave clan");
}

export async function generateInviteLink(clanId: string): Promise<string> {
  const { data, error } = await clanDb.rpc("generate_clan_invite_link", { p_clan_id: clanId });
  if (error) fail(error, "Failed to generate invite link");
  return data as string;
}

export async function redeemInviteLink(token: string): Promise<string> {
  const { data, error } = await clanDb.rpc("redeem_clan_invite_link", { p_token: token });
  if (error) fail(error, "Failed to redeem invite link");
  return data as string;
}

export async function promoteMember(clanId: string, userId: string): Promise<void> {
  const { error } = await clanDb.rpc("clan_promote_member", {
    p_clan_id: clanId,
    p_user_id: userId,
  });
  if (error) fail(error, "Failed to promote member");
}

export async function demoteMember(clanId: string, userId: string): Promise<void> {
  const { error } = await clanDb.rpc("clan_demote_member", {
    p_clan_id: clanId,
    p_user_id: userId,
  });
  if (error) fail(error, "Failed to demote member");
}

export async function kickMember(clanId: string, userId: string): Promise<void> {
  const { error } = await clanDb.rpc("clan_kick_member", { p_clan_id: clanId, p_user_id: userId });
  if (error) fail(error, "Failed to kick member");
}

export async function transferLeadership(clanId: string, newLeaderId: string): Promise<void> {
  const { error } = await clanDb.rpc("clan_transfer_leadership", {
    p_clan_id: clanId,
    p_new_leader_id: newLeaderId,
  });
  if (error) fail(error, "Failed to transfer leadership");
}

export async function disbandClan(clanId: string): Promise<void> {
  const { error } = await clanDb.rpc("clan_disband", { p_clan_id: clanId });
  if (error) fail(error, "Failed to disband clan");
}

export async function approveJoinRequest(requestId: string): Promise<void> {
  const { error } = await clanDb.rpc("clan_approve_join", { p_request_id: requestId });
  if (error) fail(error, "Failed to approve request");
}

export async function rejectJoinRequest(requestId: string): Promise<void> {
  const { error } = await clanDb.rpc("clan_reject_join", { p_request_id: requestId });
  if (error) fail(error, "Failed to reject request");
}

export async function sendChatMessage(
  clanId: string,
  senderId: string,
  content: string,
  replyTo?: string | null,
): Promise<void> {
  const { error } = await clanDb
    .from("clan_messages")
    .insert({ clan_id: clanId, sender_id: senderId, content, reply_to: replyTo ?? null });
  if (error) fail(error, "Failed to send message");
}

export async function deleteChatMessage(messageId: string): Promise<void> {
  const { error } = await clanDb.rpc("clan_delete_message", { p_message_id: messageId });
  if (error) fail(error, "Failed to delete message");
}

export async function markChatRead(clanId: string): Promise<void> {
  await clanDb.rpc("clan_mark_read", { p_clan_id: clanId });
}

export async function declareWar(defenderClanId: string): Promise<void> {
  const { error } = await clanDb.rpc("clan_declare_war", { p_defender_clan_id: defenderClanId });
  if (error) fail(error, "Failed to declare war");
}

export async function respondToWar(warId: string, accept: boolean): Promise<void> {
  const { error } = await clanDb.rpc("clan_respond_war", { p_war_id: warId, p_accept: accept });
  if (error) fail(error, accept ? "Failed to accept war" : "Failed to decline war");
}

// ------------------------------------------------------------------- admin

export async function adminListClans(
  search = "",
  limit = 50,
  offset = 0,
): Promise<{ clans: ClanSummary[]; total: number }> {
  let q = clanDb
    .from("clan_leaderboard")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (search.trim()) {
    const term = search.trim().replace(/[%_]/g, "");
    q = q.or(`name.ilike.%${term}%,tag.ilike.%${term}%`);
  }
  const { data, error, count } = await q.range(offset, offset + limit - 1);
  if (error) fail(error, "Failed to load clans");
  return { clans: (data ?? []) as ClanSummary[], total: count ?? 0 };
}

export async function adminDeleteClan(clanId: string, reason: string): Promise<void> {
  const { error } = await clanDb.rpc("admin_delete_clan", { p_clan_id: clanId, p_reason: reason });
  if (error) fail(error, "Failed to remove clan");
}

export type ClanDeletionLogEntry = {
  id: string;
  clan_id: string;
  name: string;
  tag: string;
  member_count: number;
  deleted_by: string | null;
  reason: string;
  created_at: string;
};

export async function adminListDeletedClans(limit = 50): Promise<ClanDeletionLogEntry[]> {
  const { data, error } = await clanDb
    .from("clan_deletion_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail(error, "Failed to load deletion log");
  return (data ?? []) as ClanDeletionLogEntry[];
}
