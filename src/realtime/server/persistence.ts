// =====================================================================
// PERSISTENCE — Supabase as the system of record, not the transport
// ---------------------------------------------------------------------
// Live moves no longer touch the database at all. Supabase is read once
// to hydrate a game into memory, and written once when it ends:
//
//   hydrate()   games + game_moves -> LiveGame          (on first join)
//   checkpoint()  coarse position/clock snapshot        (crash safety)
//   finalize()  PGN + moves + chat + result + ratings   (on game over)
//
// Everything here uses the service-role client, exactly as the previous
// move handler did, because RLS forbids clients from writing games or
// game_moves directly.
// =====================================================================
import type { ChatPayload, GameResult, GameStatus, SeatInfo } from "../protocol";
import { LiveGame, type LiveGameInit } from "./LiveGame";
import { logger } from "@/lib/logger";

/** Loosely-typed admin client — mirrors the pattern used across the app. */
type AdminClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error?: unknown }>;
        order: (column: string) => Promise<{ data: Array<Record<string, unknown>> | null }>;
      };
    };
    insert: (values: unknown) => Promise<{ error: { code?: string; message?: string } | null }>;
    update: (values: unknown) => {
      eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
    };
  };
  rpc: (fn: string, params: Record<string, unknown>) => Promise<{ error: unknown }>;
};

async function admin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

// Only the columns the live layer needs. `pgn` is deliberately excluded
// from the hydrate read — it grows without bound and is write-only here.
const GAME_COLUMNS =
  "id,status,result,end_reason,winner_id,fen,turn,white_id,black_id," +
  "white_username,black_username,white_rating,black_rating," +
  "white_time_ms,black_time_ms,last_move_at,initial_seconds,increment_seconds," +
  "moves_count,is_rated,time_control,draw_offered_by";

function seat(row: Record<string, unknown>, color: "white" | "black"): SeatInfo {
  return {
    userId: (row[`${color}_id`] as string | null) ?? null,
    username: (row[`${color}_username`] as string | null) ?? null,
    rating: (row[`${color}_rating`] as number | null) ?? null,
  };
}

/**
 * Build a LiveGame from the database. Returns null when the game does
 * not exist; a finished game still hydrates so late joiners and the
 * review screen see a consistent result.
 */
export async function hydrate(gameId: string): Promise<LiveGame | null> {
  const db = await admin();

  const [gameRes, movesRes, chatRes] = await Promise.all([
    db.from("games").select(GAME_COLUMNS).eq("id", gameId).maybeSingle(),
    db
      .from("game_moves")
      .select("ply,san,uci,fen_after,by_user,created_at")
      .eq("game_id", gameId)
      .order("ply"),
    db
      .from("game_chat")
      .select("id,user_id,username,body,created_at")
      .eq("game_id", gameId)
      .order("created_at"),
  ]);

  const row = gameRes.data;
  if (!row) return null;

  const moveRows = (movesRes.data ?? []) as Array<Record<string, unknown>>;
  const chat: ChatPayload[] = ((chatRes.data ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: String(c.id),
    userId: (c.user_id as string) ?? "",
    username: (c.username as string) ?? "User",
    body: (c.body as string) ?? "",
    at: new Date((c.created_at as string) ?? Date.now()).getTime(),
  }));

  const init: LiveGameInit = {
    gameId,
    white: seat(row, "white"),
    black: seat(row, "black"),
    status: (row.status as GameStatus) ?? "waiting",
    result: (row.result as GameResult) ?? "ongoing",
    endReason: (row.end_reason as string | null) ?? null,
    winnerId: (row.winner_id as string | null) ?? null,
    sanHistory: moveRows.map((m) => String(m.san)),
    whiteTimeMs: (row.white_time_ms as number) ?? 0,
    blackTimeMs: (row.black_time_ms as number) ?? 0,
    lastMoveAt: row.last_move_at ? new Date(row.last_move_at as string).getTime() : null,
    initialSeconds: (row.initial_seconds as number) ?? 0,
    incrementSeconds: (row.increment_seconds as number) ?? 0,
    isRated: Boolean(row.is_rated),
    timeControl: (row.time_control as string) ?? "",
    drawOfferedBy: (row.draw_offered_by as string | null) ?? null,
    chat,
    fen: (row.fen as string) ?? new (await import("chess.js")).Chess().fen(),
  };

  const game = new LiveGame(init);

  // Moves already in the database are history, not pending writes: seed
  // the in-memory list so `ply` continues correctly, and record how far
  // the database already is so finalize() only inserts the new ones.
  for (let i = 0; i < moveRows.length; i++) {
    const m = moveRows[i];
    const at = new Date((m.created_at as string) ?? Date.now()).getTime();
    const prevAt =
      i > 0 ? new Date((moveRows[i - 1].created_at as string) ?? Date.now()).getTime() : null;
    const tookMs = prevAt && at > prevAt ? at - prevAt : 0;
    game.moves.push({
      ply: Number(m.ply),
      san: String(m.san),
      uci: String(m.uci ?? ""),
      from: String(m.uci ?? "").slice(0, 2),
      to: String(m.uci ?? "").slice(2, 4),
      fenAfter: String(m.fen_after ?? ""),
      at,
      tookMs,
      by: (m.by_user as string | null) ?? null,
    });
  }
  persistedPlies.set(gameId, moveRows.length);
  return game;
}

/**
 * How many plies of each game the database already holds. Lets finalize()
 * insert only the moves played in memory, which also makes it safe to run
 * after a checkpoint or a re-hydration.
 */
const persistedPlies = new Map<string, number>();

/**
 * Coarse crash checkpoint: position, clock and move count only — no PGN,
 * no move rows. The spec is "save the complete game only after it
 * finishes", and this deliberately does not do that; it exists so a
 * process restart mid-game can rebuild a board that is at most one
 * checkpoint interval stale rather than losing the game outright.
 *
 * Called on an interval by the registry, never per move.
 */
export async function checkpoint(game: LiveGame): Promise<void> {
  if (!game.dirty || game.status === "finished") return;
  try {
    const db = await admin();
    const clock = game.clockSnapshot();
    const { error } = await db
      .from("games")
      .update({
        fen: game.fen,
        turn: game.turn,
        moves_count: game.ply,
        white_time_ms: clock.whiteMs,
        black_time_ms: clock.blackMs,
        last_move_at: new Date(clock.since).toISOString(),
        draw_offered_by: game.drawOfferedBy,
      })
      .eq("id", game.gameId);
    if (error) throw new Error(error.message ?? "checkpoint failed");
    game.dirty = false;
  } catch (error) {
    // Never fatal — the in-memory game remains authoritative.
    logger.error("Realtime checkpoint failed", { error, gameId: game.gameId });
  }
}

/**
 * Write the finished game: the move rows, the chat, the final position
 * and PGN, the result, and then the rating change.
 *
 * Idempotent. `game_moves` carries UNIQUE (game_id, ply), and `persisted`
 * guards re-entry, so a retry or a double "game over" cannot double-apply
 * a rating change.
 */
export async function finalize(game: LiveGame): Promise<void> {
  if (game.persisted || game.status !== "finished") return;
  game.persisted = true;

  try {
    const db = await admin();
    const clock = game.clockSnapshot();
    const alreadyPersisted = persistedPlies.get(game.gameId) ?? 0;
    const newMoves = game.moves.slice(alreadyPersisted);

    // 1. Move rows first, so a failure here leaves the game still marked
    //    active and the whole finalize can be retried on the next boot.
    if (newMoves.length > 0) {
      const { error } = await db.from("game_moves").insert(
        newMoves.map((m) => ({
          game_id: game.gameId,
          ply: m.ply,
          san: m.san,
          uci: m.uci,
          fen_after: m.fenAfter,
          by_user: m.by,
          time_left_ms: m.by === game.white.userId ? clock.whiteMs : clock.blackMs,
        })),
      );
      // A duplicate ply means these rows already landed — not an error.
      if (error && error.code !== "23505" && !/duplicate|unique/i.test(error.message ?? "")) {
        throw new Error(error.message ?? "move insert failed");
      }
    }

    // 2. Chat that was only ever held in memory during the game.
    const unsavedChat = game.chat.filter((c) => c.id.startsWith("mem:"));
    if (unsavedChat.length > 0) {
      await db.from("game_chat").insert(
        unsavedChat.map((c) => ({
          game_id: game.gameId,
          user_id: c.userId,
          username: c.username,
          body: c.body,
        })),
      );
    }

    // 3. The authoritative game row.
    const patch: Record<string, unknown> = {
      status: "finished",
      result: game.result,
      end_reason: game.endReason,
      winner_id: game.winnerId,
      fen: game.fen,
      turn: game.turn,
      moves_count: game.ply,
      white_time_ms: clock.whiteMs,
      black_time_ms: clock.blackMs,
      draw_offered_by: null,
      ended_at: new Date().toISOString(),
    };
    const pgn = game.pgn;
    if (pgn) patch.pgn = pgn;

    const { error: updErr } = await db.from("games").update(patch).eq("id", game.gameId);
    if (updErr) throw new Error(updErr.message ?? "game update failed");

    persistedPlies.set(game.gameId, game.ply);
    game.dirty = false;

    // 4. Ratings — only for rated, decisive-or-drawn games. An aborted
    //    game has no result and must never move a rating.
    if (game.isRated && game.result !== "aborted") {
      await db.rpc("apply_elo_change", { p_game_id: game.gameId });
    }

    // 5. Fair-play analysis, off the critical path exactly as before.
    void import("@/lib/anticheat/analysis.server")
      .then((m) => m.analyzeGameIfNeeded(game.gameId))
      .catch(() => {});
  } catch (error) {
    // Allow a later attempt (shutdown flush, or the next boot) to retry.
    game.persisted = false;
    logger.error("Realtime finalize failed", { error, gameId: game.gameId });
    throw error;
  }
}

/** Forget bookkeeping for a game the registry has evicted. */
export function forgetPersistenceState(gameId: string): void {
  persistedPlies.delete(gameId);
}
