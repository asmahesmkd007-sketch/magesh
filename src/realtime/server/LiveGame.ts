// =====================================================================
// LIVE GAME — the authoritative in-memory game
// ---------------------------------------------------------------------
// One instance per active game, held in the Socket.IO process. It owns
// the position, the clock and the result; the database is written only
// when the game ends (plus a coarse crash checkpoint — see registry.ts).
//
// Why a long-lived chess.js instance rather than reloading a FEN per
// move, which is what the old server function had to do:
//
//   * threefold/fivefold repetition needs the positions that came
//     before. A `new Chess(fen)` remembers none of them, so the old path
//     had to re-fetch and replay the whole move log on every single move
//     just to detect a repetition draw. Here the history is simply
//     always present.
//   * `chess.pgn()` is only meaningful on an instance that played the
//     moves. Keeping one instance means the PGN written at the end is
//     the real thing, not a one-move fragment.
//
// The clock is the existing pure `src/lib/chess/clock.ts` module — the
// same code the browser renders with, so server and client can never
// disagree about how time is computed.
// =====================================================================
import { Chess } from "chess.js";

import {
  clockFromServer,
  flagged,
  press,
  remainingMs,
  stop,
  type ClockState,
} from "@/lib/chess/clock";
import { hasMatingMaterial, terminalStateOf } from "@/lib/chess/rules";
import type {
  ChatPayload,
  ClockSnapshot,
  Color,
  GameResult,
  GameStatus,
  MovePayload,
  Promotion,
  SeatInfo,
  TerminalPayload,
} from "../protocol";

export type LiveGameInit = {
  gameId: string;
  white: SeatInfo;
  black: SeatInfo;
  status: GameStatus;
  result: GameResult;
  endReason: string | null;
  winnerId: string | null;
  /** Moves already played, oldest first (replayed to rebuild history). */
  sanHistory: string[];
  /** Banked time as of `lastMoveAt`. */
  whiteTimeMs: number;
  blackTimeMs: number;
  lastMoveAt: number | null;
  initialSeconds: number;
  incrementSeconds: number;
  isRated: boolean;
  timeControl: string;
  drawOfferedBy: string | null;
  chat: ChatPayload[];
  /** Fallback position if the move log can't be replayed cleanly. */
  fen: string;
};

export type MoveRequest = { from: string; to: string; promotion?: Promotion };

export type MoveOutcome =
  | { ok: true; move: MovePayload; terminal: TerminalPayload | null }
  | {
      ok: false;
      code: "not_your_turn" | "illegal_move" | "game_not_active" | "out_of_time";
      terminal: TerminalPayload | null;
    };

export class LiveGame {
  readonly gameId: string;
  readonly white: SeatInfo;
  readonly black: SeatInfo;
  readonly isRated: boolean;
  readonly timeControl: string;
  readonly initialSeconds: number;
  readonly incrementSeconds: number;

  status: GameStatus;
  result: GameResult;
  endReason: string | null;
  winnerId: string | null;
  drawOfferedBy: string | null;

  /** Every move played, in protocol form — this is what gets persisted. */
  readonly moves: MovePayload[] = [];
  readonly chat: ChatPayload[];

  moveDeadlineAt: number | null = null;

  /** True once anything has changed that the database hasn't seen. */
  dirty = false;
  /** Set once the finished game has been written; makes finalize idempotent. */
  persisted = false;
  /** Last time any participant interacted — used to evict idle games. */
  lastActivityAt: number;

  private readonly chess: Chess;
  private clock: ClockState;
  /** True when the move log replayed cleanly onto the stored FEN. */
  private readonly historyIntact: boolean;

  constructor(init: LiveGameInit, now: number = Date.now()) {
    this.gameId = init.gameId;
    this.white = init.white;
    this.black = init.black;
    this.isRated = init.isRated;
    this.timeControl = init.timeControl;
    this.initialSeconds = init.initialSeconds;
    this.incrementSeconds = init.incrementSeconds;
    this.status = init.status;
    this.result = init.result;
    this.endReason = init.endReason;
    this.winnerId = init.winnerId;
    this.drawOfferedBy = init.drawOfferedBy;
    this.chat = [...init.chat];
    this.lastActivityAt = now;

    // Replay the move log so repetition detection and the PGN are real.
    // A divergent log is never trusted over the stored FEN.
    const replayed = new Chess();
    let intact = true;
    try {
      for (const san of init.sanHistory) replayed.move(san);
      intact = replayed.fen() === init.fen;
    } catch {
      intact = false;
    }
    this.chess = intact ? replayed : new Chess(init.fen);
    this.historyIntact = intact;

    this.clock = clockFromServer({
      whiteTimeMs: init.whiteTimeMs,
      blackTimeMs: init.blackTimeMs,
      turn: this.chess.turn(),
      lastMoveAt: init.lastMoveAt,
      isActive: init.status === "active",
      initialSeconds: init.initialSeconds,
      incrementSeconds: init.incrementSeconds,
    });

    const deadlineSec = this.getMoveDeadlineSeconds();
    if (deadlineSec && this.status === "active") {
      const turnStart = init.lastMoveAt ?? now;
      this.moveDeadlineAt = turnStart + deadlineSec * 1000;
    } else {
      this.moveDeadlineAt = null;
    }
  }

  // ── Reads ───────────────────────────────────────────────────────────

  /** Configured per-move response deadline in seconds: Bullet = 30s, Blitz/Rapid = 60s, Classical/casual = null. */
  getMoveDeadlineSeconds(): number | null {
    if (this.initialSeconds <= 0) return null;
    if (this.initialSeconds <= 120) return 30; // Bullet: 30 seconds
    if (this.initialSeconds <= 1800) return 60; // Blitz & Rapid: 60 seconds
    return null; // Classical & un-timed: null
  }

  get fen(): string {
    return this.chess.fen();
  }

  get turn(): Color {
    return this.chess.turn();
  }

  get ply(): number {
    return this.moves.length;
  }

  /** PGN is only emitted when the replayed history was trustworthy. */
  get pgn(): string | null {
    return this.historyIntact ? this.chess.pgn() : null;
  }

  seatOf(userId: string | null | undefined): Color | null {
    if (!userId) return null;
    if (this.white.userId === userId) return "w";
    if (this.black.userId === userId) return "b";
    return null;
  }

  clockSnapshot(): ClockSnapshot {
    return {
      whiteMs: this.clock.whiteMs,
      blackMs: this.clock.blackMs,
      running: this.clock.running,
      since: this.clock.since,
      incrementMs: this.clock.incrementMs,
      untimed: this.clock.untimed,
    };
  }

  /** Milliseconds until the side to move flags, or null if they can't. */
  msUntilFlag(now: number = Date.now()): number | null {
    if (this.status !== "active" || this.clock.untimed || !this.clock.running) return null;
    return remainingMs(this.clock, this.clock.running, now);
  }

  /** Milliseconds until current player's move response deadline expires. */
  msUntilMoveDeadline(now: number = Date.now()): number | null {
    if (this.status !== "active" || !this.moveDeadlineAt) return null;
    return Math.max(0, this.moveDeadlineAt - now);
  }

  terminalPayload(): TerminalPayload | null {
    if (this.status !== "finished" && this.status !== "aborted") return null;
    return {
      status: "finished",
      result: this.result,
      endReason: this.endReason ?? "finished",
      winnerId: this.winnerId,
    };
  }

  // ── Moves ───────────────────────────────────────────────────────────

  /**
   * Validate and apply a move. This is the only way the position ever
   * changes, and it is the same call whether the request arrived from a
   * player socket or a reconnect replay.
   */
  applyMove(userId: string, request: MoveRequest, now: number = Date.now()): MoveOutcome {
    if (this.status !== "active") {
      return { ok: false, code: "game_not_active", terminal: this.terminalPayload() };
    }
    const seat = this.seatOf(userId);
    if (!seat || seat !== this.chess.turn()) {
      return { ok: false, code: "not_your_turn", terminal: null };
    }

    // Check if the move response deadline has already expired.
    const deadlineTerm = this.checkMoveDeadline(now);
    if (deadlineTerm) {
      return { ok: false, code: "out_of_time", terminal: deadlineTerm };
    }

    // The mover's flag may have fallen while they were thinking. Settle
    // that before considering the move — a move played after the flag is
    // not a move, it is a loss on time.
    const flag = this.checkFlag(now);
    if (flag) return { ok: false, code: "out_of_time", terminal: flag };

    const before = this.chess.fen();
    let move;
    try {
      move = this.chess.move({ from: request.from, to: request.to, promotion: request.promotion });
    } catch {
      return { ok: false, code: "illegal_move", terminal: null };
    }
    if (!move) return { ok: false, code: "illegal_move", terminal: null };

    const tookMs = Math.max(0, now - this.clock.since);
    // `press` banks the mover's remaining time, adds their increment and
    // hands the clock to the opponent — the same pure function the
    // browser uses to render the handover optimistically.
    this.clock = press(this.clock, now);

    const deadlineSec = this.getMoveDeadlineSeconds();
    this.moveDeadlineAt = deadlineSec && this.status === "active" ? now + deadlineSec * 1000 : null;

    const payload: MovePayload = {
      ply: this.moves.length + 1,
      san: move.san,
      uci: `${request.from}${request.to}${request.promotion ?? ""}`,
      from: request.from,
      to: request.to,
      promotion: request.promotion,
      fenAfter: this.chess.fen(),
      at: now,
      tookMs,
      by: userId,
    };
    this.moves.push(payload);
    this.drawOfferedBy = null;
    this.dirty = true;
    this.lastActivityAt = now;
    void before;

    // Terminal detection runs on the live instance, so repetition and the
    // fifty-move counter are simply correct without any replay.
    const terminal = terminalStateOf(this.chess);
    if (terminal) {
      this.finish(
        terminal.result,
        terminal.reason,
        terminal.reason === "checkmate" ? userId : null,
        now,
      );
      return { ok: true, move: payload, terminal: this.terminalPayload() };
    }
    return { ok: true, move: payload, terminal: null };
  }

  /**
   * Check if per-move response deadline has expired and auto-abort if so.
   */
  checkMoveDeadline(now: number = Date.now()): TerminalPayload | null {
    if (this.status !== "active" || !this.moveDeadlineAt) return null;
    if (now >= this.moveDeadlineAt) {
      this.finish("aborted", "move_deadline_exceeded", null, now);
      return this.terminalPayload();
    }
    return null;
  }

  /**
   * Settle a flag fall if one is due. Called before every move, and by
   * the registry's scheduled timer so a game ends on time even when
   * neither client says anything.
   *
   * FIDE 6.9 — a flag fall is only a loss if the opponent could still
   * mate by some series of legal moves; against bare king (or king and a
   * single minor) it is a draw.
   */
  checkFlag(now: number = Date.now()): TerminalPayload | null {
    if (this.status !== "active") return null;
    const fell = flagged(this.clock, now);
    if (!fell) return null;

    const opponent: Color = fell === "w" ? "b" : "w";
    const canMate = hasMatingMaterial(this.chess, opponent);
    const result: GameResult = canMate ? (opponent === "w" ? "white" : "black") : "draw";
    const winnerId = canMate ? (opponent === "w" ? this.white.userId : this.black.userId) : null;
    this.finish(result, canMate ? "timeout" : "timeout_vs_insufficient", winnerId, now);
    return this.terminalPayload();
  }

  // ── Player actions ──────────────────────────────────────────────────

  resign(userId: string, now: number = Date.now()): TerminalPayload | null {
    if (this.status !== "active") return null;
    const seat = this.seatOf(userId);
    if (!seat) return null;
    const opponent: Color = seat === "w" ? "b" : "w";
    this.finish(
      opponent === "w" ? "white" : "black",
      "resignation",
      opponent === "w" ? this.white.userId : this.black.userId,
      now,
    );
    return this.terminalPayload();
  }

  /**
   * Offer a draw, or accept the one already on the table. Returns what
   * happened so the caller can broadcast the right thing.
   */
  respondDraw(userId: string, now: number = Date.now()): "offered" | "accepted" | "inactive" {
    if (this.status !== "active") return "inactive";
    const seat = this.seatOf(userId);
    if (!seat) return "inactive";

    if (this.drawOfferedBy && this.drawOfferedBy !== userId) {
      this.finish("draw", "agreement", null, now);
      return "accepted";
    }
    this.drawOfferedBy = userId;
    this.dirty = true;
    this.lastActivityAt = now;
    return "offered";
  }

  declineDraw(userId: string): boolean {
    if (this.status !== "active" || !this.drawOfferedBy) return false;
    if (!this.seatOf(userId) || this.drawOfferedBy === userId) return false;
    this.drawOfferedBy = null;
    this.dirty = true;
    return true;
  }

  /**
   * Abort an unstarted game (no moves played). Kept distinct from a
   * resignation: an aborted game has no winner and is not a draw, and
   * must not move ratings.
   */
  abort(now: number = Date.now()): TerminalPayload | null {
    if (this.status !== "active" || this.moves.length > 0) return null;
    this.finish("aborted", "aborted", null, now);
    return this.terminalPayload();
  }

  addChat(message: ChatPayload): void {
    this.chat.push(message);
    this.dirty = true;
    this.lastActivityAt = message.at;
  }

  // ── Internals ───────────────────────────────────────────────────────

  private finish(result: GameResult, endReason: string, winnerId: string | null, now: number) {
    this.status = result === "aborted" ? "aborted" : "finished";
    this.result = result;
    this.endReason = endReason;
    this.winnerId = winnerId;
    this.drawOfferedBy = null;
    this.moveDeadlineAt = null;
    // Freeze the clock so the banked values written to the database are
    // the real remaining times at the moment the game ended.
    this.clock = stop(this.clock, now);
    this.dirty = true;
    this.lastActivityAt = now;
  }
}
