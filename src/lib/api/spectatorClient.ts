// =====================================================================
// SPECTATOR SERVICE LAYER (client)
// ---------------------------------------------------------------------
// The single client-side entry point for watching games, mirroring the
// role gameClient.ts plays for playing them. Routes and components call
// these instead of touching supabase directly.
//
// Every function here is a read through a SECURITY DEFINER RPC, because
// the underlying tables are deliberately closed: since schema.sql
// SECTION 104, an in-progress game's row and its moves are readable only
// by its two players. There is no client-side path to a live position,
// which is what makes the broadcast delay real rather than cosmetic.
//
//   supabase/schema.sql — SECTION 104: SPECTATOR MODE
// =====================================================================
import { supabase } from "@/integrations/supabase/client";
import type {
  LiveGameSort,
  LiveMatchSummary,
  SpectatorGame,
  SpectatorVisibility,
  TimeClass,
} from "@/lib/spectator/types";

// The generated Supabase types predate these RPCs, so — as in
// gameClient.ts — the signatures are declared once here and the call is
// funnelled through a single typed indirection.
type RpcMap = {
  get_spectator_game: { args: { p_game_id: string }; returns: SpectatorGame };
  list_live_games: {
    args: {
      p_limit?: number;
      p_offset?: number;
      p_time_class?: TimeClass | null;
      p_rated_only?: boolean;
      p_sort?: LiveGameSort;
    };
    returns: LiveMatchSummary[];
  };
  spectator_heartbeat: { args: { p_game_id: string }; returns: number };
  spectator_leave: { args: { p_game_id: string }; returns: null };
  set_spectator_visibility: {
    args: { p_game_id: string; p_visibility: SpectatorVisibility };
    returns: null;
  };
  set_spectator_default: { args: { p_visibility: SpectatorVisibility }; returns: null };
};

async function callRpc<K extends keyof RpcMap>(
  name: K,
  args: RpcMap[K]["args"],
): Promise<RpcMap[K]["returns"]> {
  // Call `.rpc` as a method so `this` stays bound — extracting it into a
  // variable detaches `this` and the SDK throws on `this.rest`.
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

/** Raised when the players have closed the game to this viewer. */
export class SpectatorAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpectatorAccessError";
  }
}

/**
 * One delayed snapshot of a game: the position as it stood
 * `delay_seconds` ago, plus everything the spectator UI renders around
 * it. Poll this; there is no realtime channel for live positions,
 * by design.
 */
export async function fetchSpectatorGame(gameId: string): Promise<SpectatorGame> {
  try {
    return await callRpc("get_spectator_game", { p_game_id: gameId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/not open to spectators|not allowed/i.test(msg)) {
      throw new SpectatorAccessError("This game is not open to spectators.");
    }
    throw e;
  }
}

export type LiveGameFilters = {
  limit?: number;
  offset?: number;
  timeClass?: TimeClass | null;
  ratedOnly?: boolean;
  sort?: LiveGameSort;
};

/** The /watch browse feed. Position-free — these rows cannot leak a game. */
export function listLiveGames(filters: LiveGameFilters = {}): Promise<LiveMatchSummary[]> {
  return callRpc("list_live_games", {
    p_limit: filters.limit ?? 24,
    p_offset: filters.offset ?? 0,
    p_time_class: filters.timeClass ?? null,
    p_rated_only: filters.ratedOnly ?? false,
    p_sort: filters.sort ?? "featured",
  });
}

/**
 * Register/refresh this viewer in a game's audience and get the live
 * count back. Counting is per ACCOUNT, so extra tabs do not inflate it
 * and signed-out viewers are not counted at all.
 */
export function spectatorHeartbeat(gameId: string): Promise<number> {
  return callRpc("spectator_heartbeat", { p_game_id: gameId });
}

/** Leave the audience now rather than ageing out of it. */
export function spectatorLeave(gameId: string): Promise<null> {
  return callRpc("spectator_leave", { p_game_id: gameId });
}

/**
 * Set who may watch THIS match, for the calling player's side only. The
 * match ends up as visible as the more private of the two players wants
 * it, so this can restrict the audience but never expose an opponent.
 */
export function setSpectatorVisibility(
  gameId: string,
  visibility: SpectatorVisibility,
): Promise<null> {
  return callRpc("set_spectator_visibility", {
    p_game_id: gameId,
    p_visibility: visibility,
  });
}

/** Set the account-wide default applied to every future match. */
export function setSpectatorDefault(visibility: SpectatorVisibility): Promise<null> {
  return callRpc("set_spectator_default", { p_visibility: visibility });
}

/** Read the signed-in user's account-wide spectator default. */
export async function fetchSpectatorDefault(userId: string): Promise<SpectatorVisibility> {
  const client = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          c: string,
          v: string,
        ) => {
          maybeSingle: () => Promise<{
            data: { spectator_default: SpectatorVisibility } | null;
          }>;
        };
      };
    };
  };
  const { data } = await client
    .from("profiles")
    .select("spectator_default")
    .eq("id", userId)
    .maybeSingle();
  return data?.spectator_default ?? "public";
}
