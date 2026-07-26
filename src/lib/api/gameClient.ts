// =====================================================================
// GAME SERVICE LAYER (client)
// ---------------------------------------------------------------------
// The single client-side entry point for game and matchmaking actions.
// Routes/components call these functions instead of touching supabase
// directly, so the wire format (RPC names, server-fn calls) stays in one
// place and the rest of the app gets typed, intention-revealing methods.
//
// State transitions that don't need chess validation are SECURITY DEFINER
// RPCs (create/join/matchmake/resign/draw/timeout). The actual move goes
// through the makeMove server function, which validates with chess.js and
// commits with the service role. See:
//   supabase/migrations/20260626000001_server_authority_and_matchmaking.sql
//   src/lib/api/game.functions.ts
// =====================================================================
import { supabase } from "@/integrations/supabase/client";
import { makeMove as makeMoveServerFn } from "@/lib/api/game.functions";

export type TimeClass = "bullet" | "blitz" | "rapid" | "classical" | "correspondence";
export type HostColor = "w" | "b" | "random";

// The generated Supabase types only know the original `has_role` RPC, so we
// declare the signatures of our new RPCs in one typed indirection here.
type RpcMap = {
  create_challenge: {
    args: {
      p_time_class: TimeClass;
      p_time_control: string;
      p_initial_seconds: number;
      p_increment_seconds: number;
      p_is_rated: boolean;
      p_host_color: HostColor;
    };
    returns: string;
  };
  join_game: { args: { p_game_id: string }; returns: string };
  matchmake: {
    args: {
      p_time_class: TimeClass;
      p_time_control: string;
      p_initial_seconds: number;
      p_increment_seconds: number;
    };
    returns: string | null;
  };
  leave_queue: { args: Record<string, never>; returns: null };
  resign_game: { args: { p_game_id: string }; returns: null };
  respond_draw: { args: { p_game_id: string }; returns: "offered" | "accepted" | "inactive" };
  claim_timeout: { args: { p_game_id: string }; returns: boolean };
  save_computer_game: {
    args: {
      p_my_color: "w" | "b";
      p_result: "white" | "black" | "draw";
      p_pgn: string;
      p_moves_count: number;
      p_engine_name: string;
      p_final_fen?: string;
      p_moves?: MoveRecord[];
    };
    returns: string;
  };
  save_local_game: {
    args: {
      p_my_color: "w" | "b";
      p_opponent_name: string;
      p_result: "white" | "black" | "draw";
      p_end_reason: string;
      p_pgn: string;
      p_moves_count: number;
      p_final_fen?: string;
      p_moves?: MoveRecord[];
    };
    returns: string;
  };
  send_challenge: {
    args: {
      p_opponent_id: string;
      p_time_class: TimeClass;
      p_time_control: string;
      p_initial_seconds: number;
      p_increment_seconds: number;
      p_is_rated: boolean;
    };
    returns: string;
  };
  respond_challenge: {
    args: { p_challenge_id: string; p_accept: boolean };
    returns: string | null;
  };
  cancel_challenge: { args: { p_challenge_id: string }; returns: null };
  send_friend_request: { args: { p_addressee_id: string }; returns: string };
  accept_friend_request: { args: { p_friend_id: string }; returns: null };
  respond_clan_invite: { args: { p_invite_id: string; p_accept: boolean }; returns: null };
};

export type MoveRecord = {
  ply: number;
  san: string;
  uci: string;
  fen_before?: string;
  fen_after: string;
  by_user?: string;
  is_capture?: boolean;
  is_check?: boolean;
  is_promotion?: boolean;
  is_castling?: boolean;
};

async function callRpc<K extends keyof RpcMap>(
  name: K,
  args: RpcMap[K]["args"],
): Promise<RpcMap[K]["returns"]> {
  // Call `.rpc` as a method on the client so `this` stays bound — extracting it
  // into a variable detaches `this` and the SDK throws on `this.rest`.
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

export interface ChallengeOptions {
  timeClass: TimeClass;
  timeControl: string;
  initialSeconds: number;
  incrementSeconds: number;
  isRated: boolean;
  hostColor: HostColor;
}

/** Create a private challenge; returns the new game id. */
export function createChallenge(opts: ChallengeOptions): Promise<string> {
  return callRpc("create_challenge", {
    p_time_class: opts.timeClass,
    p_time_control: opts.timeControl,
    p_initial_seconds: opts.initialSeconds,
    p_increment_seconds: opts.incrementSeconds,
    p_is_rated: opts.isRated,
    p_host_color: opts.hostColor,
  });
}

/** Take the open seat in a waiting game; returns the game id. */
export function joinGame(gameId: string): Promise<string> {
  return callRpc("join_game", { p_game_id: gameId });
}

/** Pair with a waiting player, or enqueue. Returns a game id if matched, else null. */
export function matchmake(
  opts: Omit<ChallengeOptions, "isRated" | "hostColor">,
): Promise<string | null> {
  return callRpc("matchmake", {
    p_time_class: opts.timeClass,
    p_time_control: opts.timeControl,
    p_initial_seconds: opts.initialSeconds,
    p_increment_seconds: opts.incrementSeconds,
  });
}

/** Remove yourself from the matchmaking queue. */
export function leaveQueue(): Promise<null> {
  return callRpc("leave_queue", {});
}

/** Resign the active game. */
export function resignGame(gameId: string): Promise<null> {
  return callRpc("resign_game", { p_game_id: gameId });
}

/** Offer a draw, or accept a pending offer. */
export function respondDraw(gameId: string): Promise<"offered" | "accepted" | "inactive"> {
  return callRpc("respond_draw", { p_game_id: gameId });
}

/** Claim a win when the opponent's clock has expired. Returns true if granted. */
export function claimTimeout(gameId: string): Promise<boolean> {
  return callRpc("claim_timeout", { p_game_id: gameId });
}

/** Persist a finished, unrated game played against the local engine. */
export function saveComputerGame(input: {
  myColor: "w" | "b";
  result: "white" | "black" | "draw";
  pgn: string;
  movesCount: number;
  engineName: string;
  finalFen?: string;
  moves?: MoveRecord[];
}): Promise<string> {
  return callRpc("save_computer_game", {
    p_my_color: input.myColor,
    p_result: input.result,
    p_pgn: input.pgn,
    p_moves_count: input.movesCount,
    p_engine_name: input.engineName,
    p_final_fen: input.finalFen,
    p_moves: input.moves,
  });
}

/** Persist a finished local (pass-and-play) game. */
export function saveLocalGame(input: {
  myColor: "w" | "b";
  opponentName: string;
  result: "white" | "black" | "draw";
  endReason: string;
  pgn: string;
  movesCount: number;
  finalFen?: string;
  moves?: MoveRecord[];
}): Promise<string> {
  return callRpc("save_local_game", {
    p_my_color: input.myColor,
    p_opponent_name: input.opponentName,
    p_result: input.result,
    p_end_reason: input.endReason,
    p_pgn: input.pgn,
    p_moves_count: input.movesCount,
    p_final_fen: input.finalFen,
    p_moves: input.moves,
  });
}

/** Submit a move for server-side validation and authoritative commit. */
export async function submitMove(input: {
  gameId: string;
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}) {
  return makeMoveServerFn({ data: input });
}

/** Send an in-app challenge to a specific friend; notifies them. Returns the challenge id. */
export function sendChallenge(opts: ChallengeOptions & { opponentId: string }): Promise<string> {
  return callRpc("send_challenge", {
    p_opponent_id: opts.opponentId,
    p_time_class: opts.timeClass,
    p_time_control: opts.timeControl,
    p_initial_seconds: opts.initialSeconds,
    p_increment_seconds: opts.incrementSeconds,
    p_is_rated: opts.isRated,
  });
}

/** Accept or decline an incoming challenge. Returns the new game id when accepted. */
export function respondChallenge(challengeId: string, accept: boolean): Promise<string | null> {
  return callRpc("respond_challenge", { p_challenge_id: challengeId, p_accept: accept });
}

/** Cancel an outgoing challenge that hasn't been answered yet. */
export function cancelChallenge(challengeId: string): Promise<null> {
  return callRpc("cancel_challenge", { p_challenge_id: challengeId });
}

/** Send a friend request; notifies the addressee. Returns the new friends-row id. */
export function sendFriendRequest(addresseeId: string): Promise<string> {
  return callRpc("send_friend_request", { p_addressee_id: addresseeId });
}

/** Accept an incoming friend request; notifies the original requester. */
export function acceptFriendRequest(friendId: string): Promise<null> {
  return callRpc("accept_friend_request", { p_friend_id: friendId });
}

/** Accept or reject an incoming clan invite. */
export function respondClanInvite(inviteId: string, accept: boolean): Promise<null> {
  return callRpc("respond_clan_invite", { p_invite_id: inviteId, p_accept: accept });
}
