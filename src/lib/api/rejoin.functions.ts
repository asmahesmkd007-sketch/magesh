// =====================================================================
// REJOIN — server-authoritative active-game lookup and authorization
// ---------------------------------------------------------------------
// Two server functions, both gated by `requireUserId`, which derives the
// caller's identity from the bearer token attached to every serverFn RPC
// (see integrations/supabase/auth-attacher.ts). Neither accepts a
// client-supplied player id, and neither trusts a client-supplied status,
// board or clock: the only thing a caller may name is a game id, and even
// that is re-checked against the seat list.
//
// These read the same `games` row the realtime layer hydrates from, so
// there is exactly one authority. Nothing here creates, joins, resigns or
// modifies a game — the lookup is a read, and the actual resume is the
// existing `game:join` socket handshake, which re-validates independently.
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUserId } from "@/lib/auth/requireUser.server";
import {
  rejoinDecision,
  rejoinableGames,
  type RejoinDecision,
  type RejoinGameRow,
  type RejoinableGame,
} from "@/lib/rejoin/eligibility";
import { logger } from "@/lib/logger";

// Only what the decision and the prompt need. The board, the PGN and the
// move log are deliberately absent: this endpoint answers "do you have a
// game to come back to", not "what does it look like". The authoritative
// position arrives over the socket at rejoin time.
const REJOIN_COLUMNS =
  "id,status,white_id,black_id,white_username,black_username," +
  "white_time_ms,black_time_ms,last_move_at,initial_seconds,increment_seconds," +
  "turn,moves_count,time_control,is_rated,vs_computer";

/**
 * A player can only ever hold a handful of live boards at once, and the
 * prompt shows them all. The cap is a bound on a pathological row set,
 * not a business rule.
 */
const MAX_REJOINABLE = 10;

/** Guards the one value that reaches a PostgREST filter as raw text. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LooseAdmin = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error?: { message?: string } | null;
        }>;
      };
      or: (filter: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          order: (
            column: string,
            opts: { ascending: boolean; nullsFirst?: boolean },
          ) => {
            limit: (n: number) => Promise<{
              data: Array<Record<string, unknown>> | null;
              error?: { message?: string } | null;
            }>;
          };
        };
      };
    };
  };
};

async function admin(): Promise<LooseAdmin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as LooseAdmin;
}

export type ActiveGamesResult = {
  games: RejoinableGame[];
};

/**
 * Every game the *authenticated* user may resume right now.
 *
 * Called once after authentication (see `useRejoinableGame`) — not polled.
 * The service-role client is used so the read is not shaped by RLS, and
 * the `white_id`/`black_id` filter plus `rejoinableGames` guarantee a
 * caller can only ever see their own boards.
 */
// POST, not GET, even though this only reads: the answer is specific to
// one authenticated user, and a GET is the shape a browser, proxy or CDN
// is entitled to cache by URL alone — which for a per-user reply is how
// one player ends up served another's. Every other authenticated
// user-specific server function here is POST for the same reason.
export const fetchActiveGamesServerFn = createServerFn({ method: "POST" })
  .middleware([requireUserId])
  .handler(async ({ context }): Promise<ActiveGamesResult> => {
    const userId = context.userId as string;
    try {
      // `userId` comes from a verified token, so it is already a Supabase
      // user UUID — but it is about to be interpolated into a PostgREST
      // filter expression, and a filter is not a bound parameter. Proving
      // the shape here keeps that safety local instead of depending on a
      // guarantee three modules away.
      if (!UUID.test(userId)) throw new Error("Unexpected user id shape");

      const db = await admin();
      const { data, error } = await db
        .from("games")
        .select(REJOIN_COLUMNS)
        // Seat filter first: the caller can never widen this.
        .or(`white_id.eq.${userId},black_id.eq.${userId}`)
        .eq("status", "active")
        .order("last_move_at", { ascending: false, nullsFirst: false })
        .limit(MAX_REJOINABLE);

      if (error) throw new Error(error.message ?? "active game lookup failed");

      return { games: rejoinableGames((data ?? []) as unknown as RejoinGameRow[], userId) };
    } catch (error) {
      // A failed lookup must never block the app — the user simply is not
      // offered a rejoin on this load.
      logger.error("Active game lookup failed", { error, userId });
      return { games: [] };
    }
  });

const authorizeInput = z.object({ gameId: z.string().uuid() });

export type AuthorizeRejoinResult =
  | { ok: true; gameId: string; color: "w" | "b" }
  | { ok: false; reason: Extract<RejoinDecision, { ok: false }>["reason"] };

/**
 * Authorize a resume of one specific game before the client navigates to
 * it. The socket's `game:join` performs the same checks again from the
 * handshake identity, so this is defense in depth and a better error
 * message — never the only gate.
 */
export const authorizeRejoinServerFn = createServerFn({ method: "POST" })
  .middleware([requireUserId])
  .inputValidator(authorizeInput)
  .handler(async ({ data, context }): Promise<AuthorizeRejoinResult> => {
    const userId = context.userId as string;
    try {
      const db = await admin();
      const { data: row, error } = await db
        .from("games")
        .select(REJOIN_COLUMNS)
        .eq("id", data.gameId)
        .maybeSingle();

      if (error) throw new Error(error.message ?? "game lookup failed");

      const decision = rejoinDecision(row as unknown as RejoinGameRow | null, userId);
      return decision.ok
        ? { ok: true, gameId: decision.gameId, color: decision.color }
        : { ok: false, reason: decision.reason };
    } catch (error) {
      logger.error("Rejoin authorization failed", { error, gameId: data.gameId, userId });
      return { ok: false, reason: "not_found" };
    }
  });
