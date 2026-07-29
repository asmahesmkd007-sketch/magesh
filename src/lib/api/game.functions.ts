import { createServerFn } from "@tanstack/react-start";
import { Chess } from "chess.js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// Plain constants (its only import is type-only), so this is safe to pull in
// statically — the alternative, a dynamic import, would put an await on the
// move hot path for what is just a threshold lookup.
import { ANTICHEAT_CONFIG } from "@/lib/anticheat/config";
import { rateLimit } from "@/lib/rate-limit";

// =====================================================================
// SERVER-AUTHORITATIVE MOVE HANDLER
// ---------------------------------------------------------------------
// This is the single source of truth for chess moves. The browser may
// render an optimistic board, but the move is only real once this handler
// validates it against the FEN stored in the database and commits it with
// the service-role client. RLS forbids clients from writing games/game_moves
// directly (see migration 20260626000001), so results cannot be forged.
// =====================================================================

const SQUARE = z.string().regex(/^[a-h][1-8]$/, "Invalid square");

const moveInput = z.object({
  gameId: z.string().uuid(),
  from: SQUARE,
  to: SQUARE,
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
});

// Anti-cheat evidence hook. Always fire-and-forget (`void ac(...)`) —
// recording suspicion must never add a millisecond to the move path.
async function ac(
  events: Array<{
    userId: string | null;
    gameId: string | null;
    type: import("@/lib/anticheat/types").ServerEventType;
    metadata?: Record<string, unknown>;
  }>,
): Promise<void> {
  try {
    const { recordServerEvents } = await import("@/lib/anticheat/ingest.server");
    await recordServerEvents(events);
  } catch {
    /* evidence recording is best-effort */
  }
}

export type MakeMoveResult = {
  ok: boolean;
  status: string;
  result: string;
  fen: string;
  turn: string;
  endReason: string | null;
};

export const makeMove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(moveInput)
  .handler(async ({ data, context }): Promise<MakeMoveResult> => {
    const userId = context.userId as string;

    // Guard against move-spam / runaway clients (bounded per instance).
    if (!rateLimit({ key: `move:${userId}`, limit: 10, windowMs: 1000 })) {
      void ac([{ userId, gameId: data.gameId, type: "move_rate_exceeded" }]);
      throw new Error("Too many moves — slow down");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load authoritative state.
    const { data: game, error } = await supabaseAdmin
      .from("games")
      .select("*")
      .eq("id", data.gameId)
      .maybeSingle();
    if (error) throw new Error("Failed to load game");
    if (!game) throw new Error("Game not found");

    const g = game as Record<string, unknown>;
    if (g.status !== "active") throw new Error("Game is not active");

    const myColor: "w" | "b" | null =
      g.white_id === userId ? "w" : g.black_id === userId ? "b" : null;
    if (!myColor) {
      // Ghost-move attempt: submitting into a game the caller isn't seated in.
      void ac([{ userId, gameId: data.gameId, type: "non_player_move" }]);
      throw new Error("Not a player in this game");
    }

    // Defense-in-depth: banned/suspended players cannot move (mirrors the
    // DB triggers in migration 20260701000006 that block game/tournament entry).
    const { data: prof } = await (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (
              c: string,
              v: string,
            ) => { maybeSingle: () => Promise<{ data: { account_status?: string } | null }> };
          };
        };
      }
    )
      .from("profiles")
      .select("account_status")
      .eq("id", userId)
      .maybeSingle();
    if (prof?.account_status && ["banned", "suspended"].includes(prof.account_status)) {
      void ac([{ userId, gameId: data.gameId, type: "banned_player_move_attempt" }]);
      throw new Error("Account is suspended or banned");
    }
    if (g.turn !== myColor) {
      void ac([{ userId, gameId: data.gameId, type: "wrong_turn_move" }]);
      throw new Error("Not your turn");
    }

    // Recompute the clock from the server's own timestamps — never trust the client.
    const now = Date.now();
    const lastMoveAt = g.last_move_at ? new Date(g.last_move_at as string).getTime() : now;
    let elapsed = Math.max(0, now - lastMoveAt);
    const myTimeBefore = (myColor === "w" ? g.white_time_ms : g.black_time_ms) as number;
    let increment = (g.increment_seconds as number) * 1000;

    // Tournament rule: clocks start when White plays move 1. White's think
    // time before the first move is free (no deduction, no increment); the
    // clock sweep settles 0-move boards as no-shows instead of a flag.
    // Casual games keep the always-running clock.
    if (((g.moves_count as number) ?? 0) === 0) {
      const { data: tm } = await (
        supabaseAdmin as unknown as {
          from: (t: string) => {
            select: (s: string) => {
              eq: (
                c: string,
                v: string,
              ) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown }> } };
            };
          };
        }
      )
        .from("tournament_matches")
        .select("id")
        .eq("game_id", data.gameId)
        .limit(1)
        .maybeSingle();
      if (tm) {
        elapsed = 0;
        increment = 0;
      }
    }

    // Flag fall: the mover ran out of time before moving → they lose.
    if (myTimeBefore - elapsed <= 0) {
      const result = myColor === "w" ? "black" : "white";
      const winnerId = myColor === "w" ? g.black_id : g.white_id;
      await supabaseAdmin
        .from("games")
        .update({
          status: "finished",
          result,
          winner_id: winnerId,
          end_reason: "timeout",
          ended_at: new Date().toISOString(),
          [myColor === "w" ? "white_time_ms" : "black_time_ms"]: 0,
        } as never)
        .eq("id", data.gameId);
      if (g.is_rated)
        await supabaseAdmin.rpc("apply_elo_change", { p_game_id: data.gameId } as never);
      void import("@/lib/anticheat/analysis.server")
        .then((m) => m.analyzeGameIfNeeded(data.gameId))
        .catch(() => {});
      return {
        ok: false,
        status: "finished",
        result,
        fen: g.fen as string,
        turn: g.turn as string,
        endReason: "timeout",
      };
    }

    // Validate the move against the stored position.
    const chess = new Chess(g.fen as string);
    let move;
    try {
      move = chess.move({ from: data.from, to: data.to, promotion: data.promotion });
    } catch {
      void ac([
        {
          userId,
          gameId: data.gameId,
          type: "illegal_move_attempt",
          metadata: { from: data.from, to: data.to, promotion: data.promotion ?? null },
        },
      ]);
      throw new Error("Illegal move");
    }
    if (!move) {
      void ac([
        {
          userId,
          gameId: data.gameId,
          type: "illegal_move_attempt",
          metadata: { from: data.from, to: data.to, promotion: data.promotion ?? null },
        },
      ]);
      throw new Error("Illegal move");
    }

    // Sub-human reaction time (server-measured, past the opening plies) —
    // recorded as evidence only; the pattern analysis decides if it matters.
    const acCfg = ANTICHEAT_CONFIG.server;
    if (
      ((g.moves_count as number) ?? 0) >= acCfg.speedCheckMinPly &&
      elapsed < acCfg.impossibleMoveMs
    ) {
      void ac([
        {
          userId,
          gameId: data.gameId,
          type: "impossible_move_speed",
          metadata: { elapsedMs: elapsed, ply: ((g.moves_count as number) ?? 0) + 1 },
        },
      ]);
    }

    const fenAfter = chess.fen();
    const nextTurn = chess.turn();
    const pgn = chess.pgn();
    const myTimeAfter = myTimeBefore - elapsed + increment;
    const ply = ((g.moves_count as number) ?? 0) + 1;

    let status = "active";
    let result = "ongoing";
    let winnerId: string | null = null;
    let endReason: string | null = null;
    if (chess.isCheckmate()) {
      status = "finished";
      result = myColor === "w" ? "white" : "black";
      winnerId = userId;
      endReason = "checkmate";
    } else if (chess.isStalemate()) {
      status = "finished";
      result = "draw";
      endReason = "stalemate";
    } else if (chess.isThreefoldRepetition()) {
      status = "finished";
      result = "draw";
      endReason = "repetition";
    } else if (chess.isInsufficientMaterial()) {
      status = "finished";
      result = "draw";
      endReason = "insufficient";
    } else if (chess.isDraw()) {
      status = "finished";
      result = "draw";
      endReason = "fifty-move";
    }

    // Record the move.
    const { error: moveErr } = await supabaseAdmin.from("game_moves").insert({
      game_id: data.gameId,
      ply,
      san: move.san,
      uci: `${data.from}${data.to}${data.promotion ?? ""}`,
      fen_before: g.fen as string,
      fen_after: fenAfter,
      by_user: userId,
      time_left_ms: myTimeAfter,
      time_used_ms: elapsed,
      is_capture: !!move.captured,
      is_check: chess.inCheck(),
      is_promotion: !!move.promotion,
      is_castling: move.flags.includes("k") || move.flags.includes("q"),
    } as never);
    if (moveErr) {
      // UNIQUE (game_id, ply) tripping means this exact ply was already
      // committed — a replayed/duplicated move packet racing itself.
      if (moveErr.code === "23505" || /duplicate|unique/i.test(moveErr.message ?? "")) {
        void ac([
          {
            userId,
            gameId: data.gameId,
            type: "duplicate_move",
            metadata: { ply, uci: `${data.from}${data.to}${data.promotion ?? ""}` },
          },
        ]);
      }
      throw new Error("Failed to record move");
    }

    // Update authoritative game state.
    const patch: Record<string, unknown> = {
      fen: fenAfter,
      turn: nextTurn,
      pgn,
      moves_count: ply,
      last_move_at: new Date(now).toISOString(),
      draw_offered_by: null,
      status,
      result,
      [myColor === "w" ? "white_time_ms" : "black_time_ms"]: myTimeAfter,
    };
    if (status === "finished") {
      patch.winner_id = winnerId;
      patch.end_reason = endReason;
      patch.ended_at = new Date().toISOString();
    }
    const { error: updErr } = await supabaseAdmin
      .from("games")
      .update(patch as never)
      .eq("id", data.gameId);
    if (updErr) throw new Error("Failed to update game");

    if (status === "finished" && g.is_rated) {
      await supabaseAdmin.rpc("apply_elo_change", { p_game_id: data.gameId } as never);
    }

    // Game over → queue the post-game fair-play analysis. Fire-and-forget:
    // the pipeline claims the game atomically and runs off the move path.
    if (status === "finished") {
      void import("@/lib/anticheat/analysis.server")
        .then((m) => m.analyzeGameIfNeeded(data.gameId))
        .catch(() => {});
    }

    return { ok: true, status, result, fen: fenAfter, turn: nextTurn, endReason };
  });
