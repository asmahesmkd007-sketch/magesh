// =====================================================================
// ANTI-CHEAT — post-game analysis pipeline (server-only)
// ---------------------------------------------------------------------
// Runs asynchronously AFTER a game finishes — never on the move path.
// For each human player it:
//   1. replays the game against the shared negamax reference engine
//      (lib/chess/evaluation.ts) to measure ACPL, accuracy, engine-match
//      % and best-move streaks,
//   2. runs the pure timing analysis over server-measured think times,
//   3. cross-checks the stored clocks against observed think time
//      (timer manipulation), and
//   4. checks connection-drop patterns (disconnect/reconnect abuse).
// Findings become anti_cheat_flags for human review — nothing here bans.
//
// Concurrency: an `analysis_started` event with a partial UNIQUE index
// claims the game; a second instance hitting the same game skips out.
// CPU: the engine loop yields to the event loop between plies.
// =====================================================================

import { Chess } from "chess.js";

import { negamax, orderMoves } from "@/lib/chess/evaluation";
import { logger } from "@/lib/logger";

import { ANTICHEAT_CONFIG } from "./config";
import { analyzeEngineProfile, summarizeEngineMetrics } from "./engineAnalysis";
import {
  createFlags,
  getDb,
  notifyAdmins,
  type FlagInput,
  type LooseDb,
  type Row,
} from "./ingest.server";
import { analyzeMoveTimes, detectTimerManipulation } from "./timeAnalysis";
import type { EngineMoveSample, MoveTimingSample } from "./types";

const CFG = ANTICHEAT_CONFIG.analysis;

const yieldLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

// ── Reference engine ──────────────────────────────────────────────────

function evaluateMoves(
  chess: Chess,
  depth: number,
): { bestSan: string | null; scores: Map<string, number> } {
  const color = chess.turn() === "w" ? 1 : -1;
  const moves = chess.moves({ verbose: true });
  const scores = new Map<string, number>();
  let bestSan: string | null = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  for (const m of orderMoves(moves)) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -Infinity, -alpha, -color);
    chess.undo();
    scores.set(m.san, score);
    if (score > bestScore) {
      bestScore = score;
      bestSan = m.san;
    }
    if (bestScore > alpha) alpha = bestScore;
  }
  return { bestSan, scores };
}

// ── Pipeline entry points ─────────────────────────────────────────────

/**
 * Analyze one finished game if it hasn't been analyzed yet. Safe to call
 * multiple times / concurrently — the DB claim makes it idempotent.
 * Fire with `void`; all failures are logged, never thrown to gameplay.
 */
export async function analyzeGameIfNeeded(gameId: string): Promise<void> {
  try {
    if (!ANTICHEAT_CONFIG.enabled) return;
    const db = await getDb();

    const { data: game } = await db
      .from("games")
      .select(
        "id, white_id, black_id, white_rating, black_rating, status, moves_count, vs_computer, is_rated, initial_seconds, increment_seconds, white_time_ms, black_time_ms, end_reason, time_class",
      )
      .eq("id", gameId)
      .maybeSingle();
    if (!game || game.status !== "finished") return;
    if (game.vs_computer === true) return;
    if (!game.white_id || !game.black_id) return;
    if (Number(game.moves_count ?? 0) < CFG.minPlies) return;

    // Claim: the partial unique index rejects a second analysis_started row.
    const { error: claimErr } = await db.from("anti_cheat_events").insert({
      user_id: null,
      game_id: gameId,
      event_type: "analysis_started",
      severity: "info",
      source: "analysis",
      metadata: {},
    });
    if (claimErr) return; // already claimed (or insert failed) — skip quietly

    await runAnalysis(db, gameId, game);
  } catch (error) {
    logger.warn("anticheat: game analysis failed", { error, gameId });
  }
}

/**
 * Opportunistic sweep: pick up recently finished games for a user that
 * ended outside the move handler (resignation, draw RPC, timeout claim)
 * and were therefore never queued. Bounded and fire-and-forget.
 */
export async function sweepRecentGames(userId: string): Promise<void> {
  try {
    if (!ANTICHEAT_CONFIG.enabled) return;
    const db = await getDb();
    const cutoff = new Date(Date.now() - CFG.sweepWindowHours * 3_600_000).toISOString();

    const [{ data: asWhite }, { data: asBlack }] = await Promise.all([
      db
        .from("games")
        .select("id, moves_count, vs_computer, black_id, ended_at")
        .eq("white_id", userId)
        .eq("status", "finished")
        .gte("ended_at", cutoff)
        .order("ended_at", { ascending: false })
        .limit(CFG.sweepMaxGames),
      db
        .from("games")
        .select("id, moves_count, vs_computer, white_id, ended_at")
        .eq("black_id", userId)
        .eq("status", "finished")
        .gte("ended_at", cutoff)
        .order("ended_at", { ascending: false })
        .limit(CFG.sweepMaxGames),
    ]);

    const candidates = [...(asWhite ?? []), ...(asBlack ?? [])]
      .filter((g) => g.vs_computer !== true && Number(g.moves_count ?? 0) >= CFG.minPlies)
      .slice(0, CFG.sweepMaxGames);
    if (candidates.length === 0) return;

    const ids = candidates.map((g) => String(g.id));
    const { data: done } = await db
      .from("anti_cheat_events")
      .select("game_id")
      .in("game_id", ids)
      .eq("event_type", "analysis_started");
    const claimed = new Set((done ?? []).map((r) => String(r.game_id)));

    for (const g of candidates) {
      if (claimed.has(String(g.id))) continue;
      await analyzeGameIfNeeded(String(g.id));
    }
  } catch (error) {
    logger.warn("anticheat: sweep failed", { error, userId });
  }
}

// ── The analysis itself ───────────────────────────────────────────────

async function runAnalysis(db: LooseDb, gameId: string, game: Row): Promise<void> {
  const startedAt = Date.now();
  try {
    const { data: moveRows } = await db
      .from("game_moves")
      .select("ply, san, by_user, time_used_ms")
      .eq("game_id", gameId)
      .order("ply", { ascending: true })
      .limit(CFG.maxPlies);
    const moves = (moveRows ?? []) as Array<{
      ply: number;
      san: string;
      by_user: string | null;
      time_used_ms: number | null;
    }>;
    if (moves.length < CFG.minPlies) {
      await complete(db, gameId, { skipped: "too_few_moves" });
      return;
    }

    const whiteId = String(game.white_id);
    const blackId = String(game.black_id);

    // Replay against the reference engine, collecting per-move samples.
    const chess = new Chess();
    const samplesByUser = new Map<string, EngineMoveSample[]>([
      [whiteId, []],
      [blackId, []],
    ]);
    for (const move of moves) {
      const mover = move.ply % 2 === 1 ? whiteId : blackId;
      const isBook = move.ply <= CFG.bookPlies;
      let cpl = 0;
      let isBest = false;
      try {
        if (!isBook) {
          const { bestSan, scores } = evaluateMoves(chess, CFG.engineDepth);
          const best = bestSan ? (scores.get(bestSan) ?? 0) : 0;
          const actual = scores.get(move.san);
          if (actual !== undefined) {
            cpl = Math.max(0, best - actual);
            isBest = move.san === bestSan;
          }
        }
        chess.move(move.san);
      } catch {
        // PGN/SAN divergence — abandon engine stats but keep timing checks.
        break;
      }
      samplesByUser.get(mover)?.push({
        ply: move.ply,
        san: move.san,
        cpl,
        isBest,
        isBook,
        timeUsedMs: move.time_used_ms ?? 0,
      });
      await yieldLoop(); // never monopolize the event loop
    }

    const metricsByUser: Record<string, unknown> = {};
    for (const [userId, samples] of samplesByUser) {
      const flags: FlagInput[] = [];
      const rating =
        userId === whiteId
          ? (game.white_rating as number | null)
          : (game.black_rating as number | null);

      // 1. Engine similarity
      const metrics = summarizeEngineMetrics(samples);
      metricsByUser[userId] = metrics;
      for (const f of analyzeEngineProfile(samples, { playerRating: rating ?? null })) {
        flags.push({
          userId,
          gameId,
          type: f.type,
          severity: f.severity,
          category: "engine",
          summary: f.summary,
          details: { ...f.details, metrics },
        });
      }

      // 2. Timing profile (server-measured)
      const timingSamples: MoveTimingSample[] = samples
        .filter((s) => s.timeUsedMs > 0 || s.ply > 2)
        .map((s) => ({ ply: s.ply, timeUsedMs: s.timeUsedMs }));
      for (const f of analyzeMoveTimes(timingSamples)) {
        flags.push({
          userId,
          gameId,
          type: f.type,
          severity: f.severity,
          category: "timing",
          summary: f.summary,
          details: f.details,
        });
      }

      // 3. Clock consistency: server-observed think time vs clock delta.
      const myMoves = samples.length;
      const serverTotalMs = samples.reduce((a, s) => a + s.timeUsedMs, 0);
      const finalClock =
        userId === whiteId ? Number(game.white_time_ms ?? 0) : Number(game.black_time_ms ?? 0);
      const clockDeltaMs =
        Number(game.initial_seconds ?? 0) * 1000 +
        Number(game.increment_seconds ?? 0) * 1000 * myMoves -
        finalClock;
      // Games decided on the clock are excluded: the flagging path zeroes the
      // loser's clock, so the stored value no longer reflects think time. The
      // move handler writes "timeout" while the claim_timeout RPC writes
      // "white_won_on_time"/"black_won_on_time" — match all of them.
      const decidedOnTime = /time/i.test(String(game.end_reason ?? ""));
      const timerFinding = detectTimerManipulation({ serverTotalMs, clockDeltaMs });
      if (timerFinding && !decidedOnTime) {
        flags.push({
          userId,
          gameId,
          type: timerFinding.type,
          severity: timerFinding.severity,
          category: "timing",
          summary: timerFinding.summary,
          details: timerFinding.details,
        });
      }

      // 4. Connection abuse for this game.
      const connectionFlags = await connectionAbuseFlags(db, userId, gameId);
      flags.push(...connectionFlags);

      const created = await createFlags(flags);
      if (created > 0) {
        await escalateIfNeeded(db, userId, flags);
      }
    }

    await complete(db, gameId, {
      durationMs: Date.now() - startedAt,
      metrics: metricsByUser,
      plies: moves.length,
    });
  } catch (error) {
    logger.warn("anticheat: analysis pipeline error", { error, gameId });
    await db.from("anti_cheat_events").insert({
      user_id: null,
      game_id: gameId,
      event_type: "analysis_failed",
      severity: "info",
      source: "analysis",
      metadata: { message: error instanceof Error ? error.message : String(error) },
    });
  }
}

async function complete(db: LooseDb, gameId: string, metadata: Record<string, unknown>) {
  await db.from("anti_cheat_events").insert({
    user_id: null,
    game_id: gameId,
    event_type: "analysis_completed",
    severity: "info",
    source: "analysis",
    metadata,
  });
}

/** Disconnect patterns: heavy drops in this game + chronic cycling. */
async function connectionAbuseFlags(
  db: LooseDb,
  userId: string,
  gameId: string,
): Promise<FlagInput[]> {
  const flags: FlagInput[] = [];
  const cfg = CFG.connection;
  try {
    const { data: drops } = await db
      .from("browser_events")
      .select("count")
      .eq("user_id", userId)
      .eq("game_id", gameId)
      .eq("event_type", "connection_drop");
    const gameDrops = (drops ?? []).reduce((a, r) => a + Number(r.count ?? 0), 0);
    if (gameDrops >= cfg.disconnectsPerGameFlag) {
      flags.push({
        userId,
        gameId,
        type: "disconnect_abuse",
        severity: "medium",
        category: "connection",
        summary: `${gameDrops} connection drops during a single game`,
        details: { drops: gameDrops },
      });
    }

    // Chronic reconnect cycling across recent games (7-day window).
    const cutoff = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
    const { data: weekly } = await db
      .from("browser_events")
      .select("count, game_id")
      .eq("user_id", userId)
      .eq("event_type", "connection_drop")
      .gte("created_at", cutoff)
      .limit(500);
    const rows = weekly ?? [];
    const total = rows.reduce((a, r) => a + Number(r.count ?? 0), 0);
    const distinctGames = new Set(rows.map((r) => String(r.game_id))).size;
    if (total >= cfg.reconnectCyclesFlag && distinctGames >= 3) {
      const { data: recent } = await db
        .from("anti_cheat_flags")
        .select("id")
        .eq("user_id", userId)
        .eq("flag_type", "reconnect_abuse")
        .gte("created_at", cutoff)
        .limit(1)
        .maybeSingle();
      if (!recent) {
        flags.push({
          userId,
          gameId: null,
          type: "reconnect_abuse",
          severity: "medium",
          category: "connection",
          summary: `${total} connection drops across ${distinctGames} games in 7 days`,
          details: { drops: total, games: distinctGames },
        });
      }
    }
  } catch (error) {
    logger.warn("anticheat: connection abuse check failed", { error, userId });
  }
  return flags;
}

/** Admin alerts for serious findings + repeat offenders. */
async function escalateIfNeeded(db: LooseDb, userId: string, flags: FlagInput[]): Promise<void> {
  const serious = flags.filter((f) => f.severity === "high" || f.severity === "critical");
  const engineAbuse = serious.some((f) => f.category === "engine");
  const timerAbuse = flags.some((f) => f.type === "timer_manipulation");

  if (engineAbuse) {
    await notifyAdmins(
      `engine:${userId}`,
      "Suspected engine assistance",
      "A finished game produced high-severity engine-similarity findings. Evidence is on the anti-cheat dashboard.",
      `/admin/anticheat?player=${userId}`,
    );
  }
  if (timerAbuse) {
    await notifyAdmins(
      `timer:${userId}`,
      "Possible timer manipulation",
      "Stored clocks disagree with server-observed think time for a finished game.",
      `/admin/anticheat?player=${userId}`,
    );
  }
  if (flags.some((f) => f.type === "disconnect_abuse" || f.type === "reconnect_abuse")) {
    await notifyAdmins(
      `conn:${userId}`,
      "Connection abuse pattern",
      "Repeated disconnect/reconnect behavior detected across recent games.",
      `/admin/anticheat?player=${userId}`,
    );
  }

  // Repeated suspicious games — three or more flagged games total.
  try {
    const { data: risk } = await db
      .from("player_risk_scores")
      .select("flagged_games")
      .eq("user_id", userId)
      .maybeSingle();
    if (Number(risk?.flagged_games ?? 0) >= 3) {
      await notifyAdmins(
        `repeat:${userId}`,
        "Repeated suspicious games",
        `This player now has ${Number(risk?.flagged_games)} flagged games.`,
        `/admin/anticheat?player=${userId}`,
      );
    }
  } catch {
    /* alerting is best-effort */
  }
}
