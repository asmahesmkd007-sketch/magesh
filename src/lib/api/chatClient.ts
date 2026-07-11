// =====================================================================
// CHAT SERVICE LAYER (client)
// ---------------------------------------------------------------------
// Global Chat (auto-join, 48h auto-expire) + Custom Rooms (public/
// private, owner/moderator roles) + Direct Messages. Every mutation is
// a SECURITY DEFINER RPC that re-checks membership/mute/ban server-side.
// Backend: supabase/migrations_chat.sql
// =====================================================================
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------
export type ChannelType = "global" | "room" | "dm";
export type ChannelRole = "owner" | "moderator" | "member";

export type ChatUserLite = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type ChatChannel = {
  id: string;
  type: ChannelType;
  slug: string | null;
  name: string | null;
  description: string | null;
  is_private: boolean;
  owner_id: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
  my_role: ChannelRole | null;
  is_member: boolean;
  owner: ChatUserLite | null;
  other_user: ChatUserLite | null;
  last_message: { content: string; created_at: string; user_id: string } | null;
  unread_count: number;
};

export type ChatReaction = { emoji: string; count: number; mine: boolean };

export type ChatMessage = {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  reply_to_id: string | null;
  is_deleted: boolean;
  is_pinned: boolean;
  created_at: string;
  author: ChatUserLite & { premium_tier?: string | null };
  reply_to: { id: string; content: string; user_id: string; author_name: string | null } | null;
  reactions: ChatReaction[];
};

export type ChatMember = ChatUserLite & {
  premium_tier: string | null;
  role: ChannelRole;
  muted_until: string | null;
  joined_at: string;
};

export type ChatReportReason = "spam" | "abuse" | "harassment" | "fake_information" | "other";

// ---------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------
export const fetchMyChannels = () => rpc<ChatChannel[]>("chat_my_channels");

export const discoverRooms = (search?: string, limit = 30) =>
  rpc<ChatChannel[]>("chat_discover_rooms", { p_search: search ?? null, p_limit: limit });

export const fetchChannel = (slugOrId: string) =>
  rpc<ChatChannel | null>("chat_get_channel", { p_slug_or_id: slugOrId });

export const createRoom = (name: string, description: string, isPrivate: boolean) =>
  rpc<ChatChannel>("chat_create_room", { p_name: name, p_description: description, p_is_private: isPrivate });

export const updateRoom = (channelId: string, name: string, description: string) =>
  rpc<void>("chat_update_room", { p_channel: channelId, p_name: name, p_description: description });

export const deleteRoom = (channelId: string) => rpc<void>("chat_delete_room", { p_channel: channelId });

export const joinRoom = (channelId: string) => rpc<void>("chat_join_room", { p_channel: channelId });

export const leaveRoom = (channelId: string) => rpc<void>("chat_leave_room", { p_channel: channelId });

export const inviteUser = (channelId: string, username: string) =>
  rpc<void>("chat_invite_user", { p_channel: channelId, p_username: username });

export const removeMember = (channelId: string, userId: string, ban = false) =>
  rpc<void>("chat_remove_member", { p_channel: channelId, p_user: userId, p_ban: ban });

export const muteMember = (channelId: string, userId: string, minutes: number) =>
  rpc<void>("chat_mute_member", { p_channel: channelId, p_user: userId, p_minutes: minutes });

export const setModerator = (channelId: string, userId: string, isMod: boolean) =>
  rpc<void>("chat_set_moderator", { p_channel: channelId, p_user: userId, p_is_mod: isMod });

export const getOrCreateDm = (otherUserId: string) =>
  rpc<ChatChannel>("chat_get_or_create_dm", { p_other: otherUserId });

export const markRead = (channelId: string) => rpc<void>("chat_mark_read", { p_channel: channelId });

export const fetchChannelMembers = (channelId: string) =>
  rpc<ChatMember[]>("chat_channel_members", { p_channel: channelId });

// ---------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------
export const PAGE_SIZE = 40;

export const fetchChannelFeed = (channelId: string, before?: string, limit = PAGE_SIZE) =>
  rpc<ChatMessage[]>("chat_channel_feed", { p_channel: channelId, p_before: before ?? null, p_limit: limit });

export const searchMessages = (channelId: string, query: string, limit = 30) =>
  rpc<ChatMessage[]>("chat_search_messages", { p_channel: channelId, p_query: query, p_limit: limit });

export const fetchPinnedMessages = (channelId: string) =>
  rpc<ChatMessage[]>("chat_pinned_messages", { p_channel: channelId });

export const sendMessage = (channelId: string, content: string, replyToId?: string | null) =>
  rpc<ChatMessage>("chat_send_message", { p_channel: channelId, p_content: content, p_reply_to: replyToId ?? null });

export const deleteMessage = (messageId: string) => rpc<void>("chat_delete_message", { p_message: messageId });

export const reactToMessage = (messageId: string, emoji: string) =>
  rpc<boolean>("chat_react", { p_message: messageId, p_emoji: emoji });

export const pinMessage = (messageId: string, pinned: boolean) =>
  rpc<void>("chat_pin_message", { p_message: messageId, p_pinned: pinned });

export const reportMessage = (messageId: string, reason: ChatReportReason, details?: string) =>
  rpc<void>("chat_report_message", { p_message: messageId, p_reason: reason, p_details: details ?? null });

// ---------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------
export type ChatStats = { rooms: number; dms: number; messages_24h: number; open_reports: number };
export const fetchChatStats = () => rpc<ChatStats>("admin_chat_stats");
export const resolveChatReport = (reportId: string, status: "resolved" | "dismissed" | "open") =>
  rpc<void>("admin_resolve_chat_report", { p_report_id: reportId, p_status: status });
