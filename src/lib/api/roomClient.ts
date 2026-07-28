import { supabase } from "@/integrations/supabase/client";

export type RoomStatus =
  | "waiting"
  | "guest_joined"
  | "starting"
  | "playing"
  | "finished"
  | "closed";

export type ColorMode = "random" | "host_white" | "host_black";

export type PublicRoom = {
  id: string;
  host_id: string;
  guest_id: string | null;
  status: RoomStatus;
  time_control: string;
  time_class: string;
  initial_seconds: number;
  increment_seconds: number;
  color_mode: ColorMode;
  is_rated: boolean;
  game_id: string | null;
  created_at: string;
  expires_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type QueueEntry = {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  position: number;
};

type RpcMap = {
  create_public_room: {
    args: {
      p_time_control: string;
      p_time_class: string;
      p_initial_seconds: number;
      p_increment_seconds: number;
      p_color_mode: ColorMode;
      p_is_rated: boolean;
    };
    returns: string;
  };
  join_public_room: {
    args: { p_room_id: string };
    returns: null;
  };
  leave_public_room: {
    args: { p_room_id: string };
    returns: null;
  };
  start_room_match: {
    args: { p_room_id: string };
    returns: string;
  };
  join_room_queue: {
    args: { p_room_id: string };
    returns: number;
  };
  leave_room_queue: {
    args: { p_room_id: string };
    returns: null;
  };
  room_heartbeat: {
    args: { p_room_id: string };
    returns: null;
  };
};

async function callRpc<K extends keyof RpcMap>(
  name: K,
  args: RpcMap[K]["args"],
): Promise<RpcMap[K]["returns"]> {
  const client = supabase as unknown as {
    rpc: (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as RpcMap[K]["returns"];
}

export interface CreateRoomOptions {
  timeControl: string;
  timeClass: string;
  initialSeconds: number;
  incrementSeconds: number;
  colorMode: ColorMode;
  isRated: boolean;
}

export function createRoom(opts: CreateRoomOptions): Promise<string> {
  return callRpc("create_public_room", {
    p_time_control: opts.timeControl,
    p_time_class: opts.timeClass,
    p_initial_seconds: opts.initialSeconds,
    p_increment_seconds: opts.incrementSeconds,
    p_color_mode: opts.colorMode,
    p_is_rated: opts.isRated,
  });
}

export function joinRoom(roomId: string): Promise<null> {
  return callRpc("join_public_room", { p_room_id: roomId });
}

export function leaveRoom(roomId: string): Promise<null> {
  return callRpc("leave_public_room", { p_room_id: roomId });
}

export function startMatch(roomId: string): Promise<string> {
  return callRpc("start_room_match", { p_room_id: roomId });
}

export function joinRoomQueue(roomId: string): Promise<number> {
  return callRpc("join_room_queue", { p_room_id: roomId });
}

export function leaveRoomQueue(roomId: string): Promise<null> {
  return callRpc("leave_room_queue", { p_room_id: roomId });
}

/**
 * Keep-alive ping while a client sits on the waiting room page. Lets the
 * backend tell a crashed tab / dropped connection apart from someone who
 * is still genuinely there, so a disconnected host/guest/queue slot gets
 * cleaned up automatically instead of turning into a ghost. No-op if the
 * caller isn't currently part of the room; safe to call on an interval.
 */
export function roomHeartbeat(roomId: string): Promise<null> {
  return callRpc("room_heartbeat", { p_room_id: roomId });
}

/** Fetch all queue entries for a room (ordered by position). */
export async function getRoomQueue(roomId: string): Promise<QueueEntry[]> {
  const client = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          val: string,
        ) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown }>;
        };
      };
    };
  };
  const { data } = await client
    .from("room_queue")
    .select("*")
    .eq("room_id", roomId)
    .order("position", { ascending: true });
  return (data as QueueEntry[]) ?? [];
}

/** Direct query helper — bypasses generated types for the new table. */
export async function getRoomById(roomId: string): Promise<PublicRoom | null> {
  const client = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          val: string,
        ) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
  const { data, error } = await client.from("public_rooms").select("*").eq("id", roomId).single();
  if (error) return null;
  return data as PublicRoom;
}
