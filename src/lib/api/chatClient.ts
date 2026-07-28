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
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{
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
  full_name: string;
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
  room_code: string | null;
  icon: string | null;
  max_members: number | null;
  online_count: number;
  is_permanent: boolean;
  coming_soon: boolean;
  password_protected: boolean;
  /** Display order for permanent/global rooms; higher-priority rooms sort first. */
  sort_order?: number;
  /** Whether the current viewer is allowed to post (false for "coming soon" rooms). */
  can_message?: boolean;
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

export const discoverRooms = async (search?: string, limit = 30) => {
  try {
    const res = await rpc<ChatChannel[]>("chat_discover_rooms", {
      p_search: search ?? null,
      p_limit: limit,
    });
    return res ?? [];
  } catch (err) {
    console.error("discoverRooms error:", err);
    return [];
  }
};

export const discoverPrivateRooms = async (search?: string, limit = 30) => {
  try {
    const res = await rpc<ChatChannel[]>("chat_discover_private_rooms", {
      p_search: search ?? null,
      p_limit: limit,
    });
    return res ?? [];
  } catch (err) {
    console.error("discoverPrivateRooms error:", err);
    return [];
  }
};

const MOCK_GLOBAL_ROOMS: ChatChannel[] = [
  {
    id: "mock-global",
    type: "global",
    slug: "global",
    name: "Global Chat",
    description: "Every ChessOx player, one room",
    is_private: false,
    owner_id: null,
    is_permanent: true,
    icon: "🌍",
    member_count: 1204,
    online_count: 42,
    unread_count: 0,
    sort_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    coming_soon: false,
    is_member: false,
    can_message: true,
    my_role: null,
    owner: null,
    other_user: null,
    last_message: null,
    room_code: null,
    max_members: null,
    password_protected: false,
  },
  {
    id: "mock-gen-en",
    type: "room",
    slug: "general-en",
    name: "General Chat (English)",
    description: "General chat in English",
    is_private: false,
    owner_id: null,
    is_permanent: true,
    icon: "🌍",
    member_count: 500,
    online_count: 12,
    unread_count: 0,
    sort_order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    coming_soon: false,
    is_member: false,
    can_message: true,
    my_role: null,
    owner: null,
    other_user: null,
    last_message: null,
    room_code: null,
    max_members: null,
    password_protected: false,
  },
  {
    id: "mock-gen-ta",
    type: "room",
    slug: "general-ta",
    name: "General Chat (Tamil)",
    description: "General chat in Tamil",
    is_private: false,
    owner_id: null,
    is_permanent: true,
    icon: "🇮🇳",
    member_count: 300,
    online_count: 5,
    unread_count: 0,
    sort_order: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    coming_soon: false,
    is_member: false,
    can_message: true,
    my_role: null,
    owner: null,
    other_user: null,
    last_message: null,
    room_code: null,
    max_members: null,
    password_protected: false,
  },
  {
    id: "mock-gen-ml",
    type: "room",
    slug: "general-ml",
    name: "General Chat (Malayalam)",
    description: "General chat in Malayalam",
    is_private: false,
    owner_id: null,
    is_permanent: true,
    icon: "🇮🇳",
    member_count: 150,
    online_count: 2,
    unread_count: 0,
    sort_order: 4,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    coming_soon: false,
    is_member: false,
    can_message: true,
    my_role: null,
    owner: null,
    other_user: null,
    last_message: null,
    room_code: null,
    max_members: null,
    password_protected: false,
  },
  {
    id: "mock-gen-te",
    type: "room",
    slug: "general-te",
    name: "General Chat (Telugu)",
    description: "General chat in Telugu",
    is_private: false,
    owner_id: null,
    is_permanent: true,
    icon: "🇮🇳",
    member_count: 200,
    online_count: 8,
    unread_count: 0,
    sort_order: 5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    coming_soon: false,
    is_member: false,
    can_message: true,
    my_role: null,
    owner: null,
    other_user: null,
    last_message: null,
    room_code: null,
    max_members: null,
    password_protected: false,
  },
  {
    id: "mock-gen-kn",
    type: "room",
    slug: "general-kn",
    name: "General Chat (Kannada)",
    description: "General chat in Kannada",
    is_private: false,
    owner_id: null,
    is_permanent: true,
    icon: "🇮🇳",
    member_count: 180,
    online_count: 4,
    unread_count: 0,
    sort_order: 6,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    coming_soon: false,
    is_member: false,
    can_message: true,
    my_role: null,
    owner: null,
    other_user: null,
    last_message: null,
    room_code: null,
    max_members: null,
    password_protected: false,
  },
  {
    id: "mock-gen-hi",
    type: "room",
    slug: "general-hi",
    name: "General Chat (Hindi)",
    description: "General chat in Hindi",
    is_private: false,
    owner_id: null,
    is_permanent: true,
    icon: "🇮🇳",
    member_count: 800,
    online_count: 25,
    unread_count: 0,
    sort_order: 7,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    coming_soon: false,
    is_member: false,
    can_message: true,
    my_role: null,
    owner: null,
    other_user: null,
    last_message: null,
    room_code: null,
    max_members: null,
    password_protected: false,
  },
  {
    id: "mock-gen-mr",
    type: "room",
    slug: "general-mr",
    name: "General Chat (Marathi)",
    description: "General chat in Marathi",
    is_private: false,
    owner_id: null,
    is_permanent: true,
    icon: "🇮🇳",
    member_count: 250,
    online_count: 6,
    unread_count: 0,
    sort_order: 8,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    coming_soon: false,
    is_member: false,
    can_message: true,
    my_role: null,
    owner: null,
    other_user: null,
    last_message: null,
    room_code: null,
    max_members: null,
    password_protected: false,
  },
  {
    id: "mock-gen-gu",
    type: "room",
    slug: "general-gu",
    name: "General Chat (Gujarati)",
    description: "General chat in Gujarati",
    is_private: false,
    owner_id: null,
    is_permanent: true,
    icon: "🇮🇳",
    member_count: 120,
    online_count: 1,
    unread_count: 0,
    sort_order: 9,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    coming_soon: false,
    is_member: false,
    can_message: true,
    my_role: null,
    owner: null,
    other_user: null,
    last_message: null,
    room_code: null,
    max_members: null,
    password_protected: false,
  },
  {
    id: "mock-gen-bn",
    type: "room",
    slug: "general-bn",
    name: "General Chat (Bengali)",
    description: "General chat in Bengali",
    is_private: false,
    owner_id: null,
    is_permanent: true,
    icon: "🇮🇳",
    member_count: 320,
    online_count: 10,
    unread_count: 0,
    sort_order: 10,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    coming_soon: false,
    is_member: false,
    can_message: true,
    my_role: null,
    owner: null,
    other_user: null,
    last_message: null,
    room_code: null,
    max_members: null,
    password_protected: false,
  },
  {
    id: "mock-gen-or",
    type: "room",
    slug: "general-or",
    name: "General Chat (Odia)",
    description: "General chat in Odia",
    is_private: false,
    owner_id: null,
    is_permanent: true,
    icon: "🇮🇳",
    member_count: 90,
    online_count: 0,
    unread_count: 0,
    sort_order: 11,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    coming_soon: false,
    is_member: false,
    can_message: true,
    my_role: null,
    owner: null,
    other_user: null,
    last_message: null,
    room_code: null,
    max_members: null,
    password_protected: false,
  },
  {
    id: "mock-gen-ur",
    type: "room",
    slug: "general-ur",
    name: "General Chat (Urdu)",
    description: "General chat in Urdu",
    is_private: false,
    owner_id: null,
    is_permanent: true,
    icon: "🇮🇳",
    member_count: 110,
    online_count: 2,
    unread_count: 0,
    sort_order: 12,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    coming_soon: false,
    is_member: false,
    can_message: true,
    my_role: null,
    owner: null,
    other_user: null,
    last_message: null,
    room_code: null,
    max_members: null,
    password_protected: false,
  },
];

export const fetchPermanentRooms = async () => {
  try {
    const res = await rpc<ChatChannel[]>("chat_permanent_rooms");
    if (!res || res.length === 0) return MOCK_GLOBAL_ROOMS;
    return res;
  } catch (error) {
    console.error("fetchPermanentRooms fallback triggered:", error);
    return MOCK_GLOBAL_ROOMS;
  }
};

export const fetchChannel = async (slugOrId: string): Promise<ChatChannel | null> => {
  try {
    const res = await rpc<ChatChannel | null>("chat_get_channel", { p_slug_or_id: slugOrId });
    if (res) return res;
  } catch (error) {
    console.error("fetchChannel RPC error:", error);
  }
  const mock = MOCK_GLOBAL_ROOMS.find((r) => r.slug === slugOrId || r.id === slugOrId);
  return mock ?? null;
};

async function resolveChannelId(channelId: string): Promise<string> {
  if (!channelId) return channelId;
  if (
    channelId === "mock-global" ||
    channelId === "global" ||
    channelId.startsWith("mock-") ||
    !channelId.includes("-")
  ) {
    const slug = channelId === "mock-global" ? "global" : channelId;
    const ch = await fetchChannel(slug);
    if (ch && ch.id && !ch.id.startsWith("mock-")) {
      return ch.id;
    }
  }
  return channelId;
}

/** True if no existing room already uses this Room ID (slug). Used for live validation in CreateRoomModal. */
export const isRoomIdAvailable = async (roomId: string) => {
  const { data, error } = await supabase
    .from("chat_channels")
    .select("id")
    .eq("slug", roomId)
    .maybeSingle();
  if (error) return true; // fail-open: let the create RPC be the final authority
  return !data;
};

export const createRoom = (
  name: string,
  description: string,
  isPrivate: boolean,
  icon?: string,
  maxMembers?: number | null,
  password?: string | null,
  roomId?: string | null,
) =>
  rpc<ChatChannel>("chat_create_room", {
    p_name: name,
    p_description: description,
    p_is_private: isPrivate,
    p_icon: icon ?? "💬",
    p_max_members: maxMembers ?? null,
    p_password: password ?? null,
    p_slug: roomId ?? null,
  });

export const joinPrivateRoom = (roomCode: string, password: string) =>
  rpc<ChatChannel>("chat_join_private_room", { p_room_code: roomCode, p_password: password });

export const updateRoom = (channelId: string, name: string, description: string) =>
  rpc<void>("chat_update_room", { p_channel: channelId, p_name: name, p_description: description });

export const deleteRoom = (channelId: string) =>
  rpc<void>("chat_delete_room", { p_channel: channelId });

export const joinRoom = async (channelId: string) => {
  const resolved = await resolveChannelId(channelId);
  return rpc<void>("chat_join_room", { p_channel: resolved });
};

/** Join a public room by its Room ID (slug) — used by the "Join Room" modal. Throws if private or not found. */
export const joinPublicRoomBySlug = async (slug: string) => {
  const { data, error } = await supabase
    .from("chat_channels")
    .select("id, is_private")
    .eq("slug", slug)
    .single();
  if (error || !data) throw new Error("Room not found");
  if (data.is_private) throw new Error("This room is private. Use a password to join.");
  return joinRoom(data.id);
};

export const leaveRoom = (channelId: string) =>
  rpc<void>("chat_leave_room", { p_channel: channelId });

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

export const markRead = async (channelId: string) => {
  const resolved = await resolveChannelId(channelId);
  return rpc<void>("chat_mark_read", { p_channel: resolved });
};

export const fetchChannelMembers = async (channelId: string) => {
  const resolved = await resolveChannelId(channelId);
  return rpc<ChatMember[]>("chat_channel_members", { p_channel: resolved });
};

// ---------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------
export const PAGE_SIZE = 40;

export const fetchChannelFeed = async (channelId: string, before?: string, limit = PAGE_SIZE) => {
  const resolved = await resolveChannelId(channelId);
  return rpc<ChatMessage[]>("chat_channel_feed", {
    p_channel: resolved,
    p_before: before ?? null,
    p_limit: limit,
  });
};

export const searchMessages = async (channelId: string, query: string, limit = 30) => {
  const resolved = await resolveChannelId(channelId);
  return rpc<ChatMessage[]>("chat_search_messages", {
    p_channel: resolved,
    p_query: query,
    p_limit: limit,
  });
};

export const fetchPinnedMessages = async (channelId: string) => {
  const resolved = await resolveChannelId(channelId);
  return rpc<ChatMessage[]>("chat_pinned_messages", { p_channel: resolved });
};

export const sendMessage = async (
  channelId: string,
  content: string,
  replyToId?: string | null,
) => {
  const resolved = await resolveChannelId(channelId);
  return rpc<ChatMessage>("chat_send_message", {
    p_channel: resolved,
    p_content: content,
    p_reply_to: replyToId ?? null,
  });
};

export const deleteMessage = (messageId: string) =>
  rpc<void>("chat_delete_message", { p_message: messageId });

export const reactToMessage = (messageId: string, emoji: string) =>
  rpc<boolean>("chat_react", { p_message: messageId, p_emoji: emoji });

export const pinMessage = (messageId: string, pinned: boolean) =>
  rpc<void>("chat_pin_message", { p_message: messageId, p_pinned: pinned });

export const reportMessage = (messageId: string, reason: ChatReportReason, details?: string) =>
  rpc<void>("chat_report_message", {
    p_message: messageId,
    p_reason: reason,
    p_details: details ?? null,
  });

// ---------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------
export type ChatStats = { rooms: number; dms: number; messages_24h: number; open_reports: number };
export const fetchChatStats = () => rpc<ChatStats>("admin_chat_stats");
export const resolveChatReport = (reportId: string, status: "resolved" | "dismissed" | "open") =>
  rpc<void>("admin_resolve_chat_report", { p_report_id: reportId, p_status: status });
