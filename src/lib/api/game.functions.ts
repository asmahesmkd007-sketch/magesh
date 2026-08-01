import { createServerFn } from "@tanstack/react-start";
import { Chess } from "chess.js";
import { z } from "zod";

import { requireUserId } from "@/lib/auth/requireUser.server";
// Plain constants (its only import is type-only), so this is safe to pull in
// statically — the alternative, a dynamic import, would put an await on the
// move hot path for what is just a threshold lookup.
import { ANTICHEAT_CONFIG } from "@/lib/anticheat/config";
import { hasMatingMaterial, terminalStateOf } from "@/lib/chess/rules";
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
  // ── Authoritative post-write row state ──────────────────────────────
  // The mover used to learn the outcome of its own write by waiting for
  // Postgres to replicate it back through Realtime — a full extra hop for
  // values this handler already holds. Returning them here lets the client
  // reconcile straight off the response, and means a dropped Realtime
  // event no longer strands the board.
  /** `games.moves_count` after this write. */
  ply: number;
  /** The move that was committed; null when nothing was played (flag fall). */
  san: string | null;
  uci: string | null;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastMoveAt: string;
  winnerId: string | null;
};

// Exactly the columns the move path reads. `select("*")` also dragged the
// PGN column across the wire on every move — a value this handler never
// reads, and the one column that grows without bound as the game goes on.
const MOVE_GAME_COLUMNS =
  "id,status,turn,fen,white_id,black_id,white_time_ms,black_time_ms," +
  "increment_seconds,last_move_at,moves_count,is_rated";

export const makeMove = createServerFn({ method: "POST" })
  .middleware([requireUserId])
  .inputValidator(moveInput)
  .handler(async ({ data, context }): Promise<MakeMoveResult> => {
    const userId = context.userId as string;

    // Guard against move-spam / runaway clients (bounded per instance).
    if (!rateLimit({ key: `move:${userId}`, limit: 10, windowMs: 1000 })) {
      void ac([{ userId, gameId: data.gameId, type: "move_rate_exceeded" }]);
      throw new Error("Too many moves — slow down");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // These three reads are independent — the game row is keyed by the id in
    // the request, the account check by the id in the token, and the move log
    // by the same game id — so they go out together. Awaited one after another
    // (as they were) they cost three serial Supabase round-trips before
    // validation could even begin, and the *opponent* waits out every one of
    // them: nothing reaches their board until this write lands.
    const loose = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{
              data: Record<string, unknown> | null;
              error?: { message: string } | null;
            }>;
            order: (c: string) => Promise<{ data: Array<{ san: string }> | null }>;
          };
        };
      };
    };
    const [gameRes, profRes, priorRes] = await Promise.all([
      loose.from("games").select(MOVE_GAME_COLUMNS).eq("id", data.gameId).maybeSingle(),
      // Defense-in-depth: banned/suspended players cannot move (mirrors the
      // DB triggers in migration 20260701000006 that block game/tournament
      // entry). Read fresh on every move — identity may be cached upstream,
      // but standing never is.
      loose.from("profiles").select("account_status").eq("id", userId).maybeSingle(),
      // Prior moves are needed to replay the game (see the note further
      // down); fetching them here costs nothing extra now that it overlaps
      // the other two.
      loose.from("game_moves").select("ply,san").eq("game_id", data.gameId).order("ply"),
    ]);

    if (gameRes.error) throw new Error("Failed to load game");
    const game = gameRes.data;
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

    const prof = profRes.data as { account_status?: string } | null;
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

    // Flag fall: the mover ran out of time before moving.
    if (myTimeBefore - elapsed <= 0) {
      const opponent: "w" | "b" = myColor === "w" ? "b" : "w";
      // FIDE 6.9 — a flag fall is only a loss if the opponent could still
      // deliver mate "by any possible series of legal moves". Against a bare
      // king (or king + a single minor) it is a draw. Awarding the win
      // regardless was one of the ways a result could be declared wrongly.
      // Material depends only on the current position, so the stored FEN is
      // sufficient here — no history needed.
      const canMate = hasMatingMaterial(new Chess(g.fen as string), opponent);
      const result = canMate ? (opponent === "w" ? "white" : "black") : "draw";
      const winnerId = canMate ? (opponent === "w" ? g.white_id : g.black_id) : null;
      const endReason = canMate ? "timeout" : "timeout_vs_insufficient";
      await supabaseAdmin
        .from("games")
        .update({
          status: "finished",
          result,
          winner_id: winnerId,
          end_reason: endReason,
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
        endReason,
        ply: (g.moves_count as number) ?? 0,
        san: null,
        uci: null,
        whiteTimeMs: myColor === "w" ? 0 : (g.white_time_ms as number),
        blackTimeMs: myColor === "b" ? 0 : (g.black_time_ms as number),
        lastMoveAt: (g.last_move_at as string | null) ?? new Date(now).toISOString(),
        winnerId: (winnerId as string | null) ?? null,
      };
    }

    // Rebuild the game from its recorded moves rather than from the stored
    // FEN alone. A `new Chess(fen)` remembers no earlier positions, which
    // made two things impossible:
    //   * repetition draws — isThreefoldRepetition() counts only positions
    //     the instance itself has played, so it was permanently false;
    //   * a real PGN — chess.pgn() on a FEN-seeded instance emits just the
    //     one move that was played, under SetUp/FEN headers, so every move
    //     overwrote games.pgn with a one-move fragment.
    // game_moves is the authoritative record and is written in the same
    // transaction as the FEN, so replaying it reproduces the position
    // exactly; the equality check below keeps a divergent record from ever
    // being trusted over the stored FEN.
    const priorMoves = priorRes.data;

    let chess = new Chess();
    let historyIntact = true;
    try {
      for (const row of (priorMoves ?? []) as Array<{ san: string }>) chess.move(row.san);
      historyIntact = chess.fen() === (g.fen as string);
    } catch {
      historyIntact = false;
    }
    if (!historyIntact) {
      // Corrupt or partial move log — fall back to the stored FEN so the
      // move is still validated correctly, and leave the PGN column alone
      // rather than replacing it with a fragment.
      chess = new Chess(g.fen as string);
    }

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
    const myTimeAfter = myTimeBefore - elapsed + increment;
    const ply = ((g.moves_count as number) ?? 0) + 1;
    const uci = `${data.from}${data.to}${data.promotion ?? ""}`;
    const movedAt = new Date(now).toISOString();

    // Terminal detection goes through the shared FIDE rules module so the
    // server, the live board, local play and the bot all agree on both the
    // verdict and its reason. The previous chain ended in a bare
    // `chess.isDraw()` labelled "fifty-move", which mislabels every draw
    // that reaches it, and checked repetition on an instance that could
    // never report it.
    const terminal = terminalStateOf(chess);
    const status = terminal ? "finished" : "active";
    const result = terminal ? terminal.result : "ongoing";
    const endReason = terminal ? terminal.reason : null;
    const winnerId = terminal && terminal.reason === "checkmate" ? userId : null;

    // Record the move.
    const { error: moveErr } = await supabaseAdmin.from("game_moves").insert({
      game_id: data.gameId,
      ply,
      san: move.san,
      uci,
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
        void ac([{ userId, gameId: data.gameId, type: "duplicate_move", metadata: { ply, uci } }]);
      }
      throw new Error("Failed to record move");
    }

    // Update authoritative game state. The PGN column is only rewritten
    // when the replayed history matched the stored FEN — otherwise the
    // instance holds a SetUp/FEN fragment, and keeping the previous value
    // is strictly better than overwriting a real game with one move.
    const patch: Record<string, unknown> = {
      fen: fenAfter,
      turn: nextTurn,
      moves_count: ply,
      last_move_at: movedAt,
      draw_offered_by: null,
      status,
      result,
      [myColor === "w" ? "white_time_ms" : "black_time_ms"]: myTimeAfter,
    };
    if (historyIntact) patch.pgn = chess.pgn();
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

    return {
      ok: true,
      status,
      result,
      fen: fenAfter,
      turn: nextTurn,
      endReason,
      ply,
      san: move.san,
      uci,
      whiteTimeMs: myColor === "w" ? myTimeAfter : (g.white_time_ms as number),
      blackTimeMs: myColor === "b" ? myTimeAfter : (g.black_time_ms as number),
      lastMoveAt: movedAt,
      winnerId,
    };
  });
