import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import { LiveGame, type LiveGameInit } from "./LiveGame";

const WHITE = "11111111-1111-1111-1111-111111111111";
const BLACK = "22222222-2222-2222-2222-222222222222";
const STRANGER = "33333333-3333-3333-3333-333333333333";
const T0 = 1_000_000;

function makeGame(over: Partial<LiveGameInit> = {}, now = T0): LiveGame {
  const init: LiveGameInit = {
    gameId: "game-1",
    white: { userId: WHITE, username: "white", rating: 1500 },
    black: { userId: BLACK, username: "black", rating: 1500 },
    status: "active",
    result: "ongoing",
    endReason: null,
    winnerId: null,
    sanHistory: [],
    whiteTimeMs: 180_000,
    blackTimeMs: 180_000,
    lastMoveAt: now,
    initialSeconds: 180,
    incrementSeconds: 2,
    isRated: true,
    timeControl: "3+2",
    drawOfferedBy: null,
    chat: [],
    fen: new Chess().fen(),
    ...over,
  };
  return new LiveGame(init, now);
}

describe("move validation", () => {
  it("accepts a legal move from the side to move", () => {
    const g = makeGame();
    const out = g.applyMove(WHITE, { from: "e2", to: "e4" }, T0 + 1000);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.move.san).toBe("e4");
    expect(out.move.ply).toBe(1);
    expect(g.turn).toBe("b");
  });

  it("refuses a move from the side that is not to move", () => {
    const g = makeGame();
    const out = g.applyMove(BLACK, { from: "e7", to: "e5" }, T0 + 1000);
    expect(out).toMatchObject({ ok: false, code: "not_your_turn" });
    expect(g.ply).toBe(0);
  });

  it("refuses a move from someone not seated in the game", () => {
    const g = makeGame();
    expect(g.applyMove(STRANGER, { from: "e2", to: "e4" }, T0 + 1)).toMatchObject({
      ok: false,
      code: "not_your_turn",
    });
  });

  it("refuses an illegal move without corrupting the position", () => {
    const g = makeGame();
    const before = g.fen;
    expect(g.applyMove(WHITE, { from: "e2", to: "e5" }, T0 + 1)).toMatchObject({
      ok: false,
      code: "illegal_move",
    });
    expect(g.fen).toBe(before);
    expect(g.ply).toBe(0);
  });

  it("refuses any move once the game is finished", () => {
    const g = makeGame();
    g.resign(WHITE, T0 + 10);
    expect(g.applyMove(BLACK, { from: "e7", to: "e5" }, T0 + 20)).toMatchObject({
      ok: false,
      code: "game_not_active",
    });
  });
});

describe("clock authority", () => {
  it("charges the mover for their own think time and adds the increment", () => {
    const g = makeGame();
    g.applyMove(WHITE, { from: "e2", to: "e4" }, T0 + 10_000);
    const clock = g.clockSnapshot();
    // 180s - 10s thought + 2s increment.
    expect(clock.whiteMs).toBe(180_000 - 10_000 + 2_000);
    // Black has not moved, so their bank is untouched and now running.
    expect(clock.blackMs).toBe(180_000);
    expect(clock.running).toBe("b");
  });

  it("hands the clock over on every move", () => {
    const g = makeGame();
    g.applyMove(WHITE, { from: "e2", to: "e4" }, T0 + 1_000);
    expect(g.clockSnapshot().running).toBe("b");
    g.applyMove(BLACK, { from: "e7", to: "e5" }, T0 + 3_000);
    expect(g.clockSnapshot().running).toBe("w");
  });

  it("reports when the side to move will flag", () => {
    const g = makeGame();
    expect(g.msUntilFlag(T0)).toBe(180_000);
    expect(g.msUntilFlag(T0 + 60_000)).toBe(120_000);
  });

  it("stops the clock when the game ends", () => {
    const g = makeGame();
    g.resign(WHITE, T0 + 5_000);
    expect(g.clockSnapshot().running).toBeNull();
  });
});

describe("flag fall", () => {
  it("awards the win when the opponent can still mate", () => {
    const g = makeGame();
    const terminal = g.checkFlag(T0 + 181_000);
    expect(terminal).toMatchObject({ result: "black", endReason: "timeout", winnerId: BLACK });
    expect(g.status).toBe("finished");
  });

  it("is a draw when the opponent cannot mate (FIDE 6.9)", () => {
    // Black has a bare king; White flags. Nobody can mate, so it is drawn.
    const fen = "7k/8/8/8/8/8/8/6QK w - - 0 1";
    const g = makeGame({ fen, whiteTimeMs: 1_000, blackTimeMs: 60_000 });
    const terminal = g.checkFlag(T0 + 2_000);
    expect(terminal).toMatchObject({ result: "draw", endReason: "timeout_vs_insufficient" });
    expect(terminal?.winnerId).toBeNull();
  });

  it("refuses a move played after the mover's flag already fell", () => {
    const g = makeGame();
    const out = g.applyMove(WHITE, { from: "e2", to: "e4" }, T0 + 181_000);
    expect(out).toMatchObject({ ok: false, code: "out_of_time" });
    expect(g.status).toBe("finished");
    expect(g.result).toBe("black");
  });

  it("never flags an untimed game", () => {
    const g = makeGame({ initialSeconds: 0, whiteTimeMs: 0, blackTimeMs: 0 });
    expect(g.msUntilFlag(T0 + 10_000_000)).toBeNull();
    expect(g.checkFlag(T0 + 10_000_000)).toBeNull();
  });
});

describe("terminal detection", () => {
  it("detects checkmate and names the mover as winner", () => {
    const g = makeGame();
    g.applyMove(WHITE, { from: "f2", to: "f3" }, T0 + 1);
    g.applyMove(BLACK, { from: "e7", to: "e5" }, T0 + 2);
    g.applyMove(WHITE, { from: "g2", to: "g4" }, T0 + 3);
    const out = g.applyMove(BLACK, { from: "d8", to: "h4" }, T0 + 4);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.terminal).toMatchObject({
      result: "black",
      endReason: "checkmate",
      winnerId: BLACK,
    });
    expect(g.status).toBe("finished");
  });

  it("detects threefold repetition, which needs real move history", () => {
    const g = makeGame();
    // Shuffle knights back and forth to repeat the start position twice.
    const cycle: Array<[string, string, string]> = [
      [WHITE, "g1", "f3"],
      [BLACK, "g8", "f6"],
      [WHITE, "f3", "g1"],
      [BLACK, "f6", "g8"],
    ];
    let t = T0;
    let terminal = null;
    for (let i = 0; i < 3 && !terminal; i++) {
      for (const [who, from, to] of cycle) {
        const out = g.applyMove(who, { from, to }, (t += 100));
        if (out.ok && out.terminal) {
          terminal = out.terminal;
          break;
        }
      }
    }
    expect(terminal).toMatchObject({ result: "draw", endReason: "repetition" });
  });

  it("produces a real PGN from the played moves", () => {
    const g = makeGame();
    g.applyMove(WHITE, { from: "e2", to: "e4" }, T0 + 1);
    g.applyMove(BLACK, { from: "e7", to: "e5" }, T0 + 2);
    expect(g.pgn).toContain("1. e4 e5");
  });
});

describe("resign, draw and abort", () => {
  it("awards the opponent on resignation", () => {
    const g = makeGame();
    expect(g.resign(BLACK, T0 + 1)).toMatchObject({
      result: "white",
      endReason: "resignation",
      winnerId: WHITE,
    });
  });

  it("ignores a resignation from a non-player", () => {
    const g = makeGame();
    expect(g.resign(STRANGER, T0 + 1)).toBeNull();
    expect(g.status).toBe("active");
  });

  it("offers, then draws on the opponent's acceptance", () => {
    const g = makeGame();
    expect(g.respondDraw(WHITE, T0 + 1)).toBe("offered");
    expect(g.drawOfferedBy).toBe(WHITE);
    expect(g.respondDraw(BLACK, T0 + 2)).toBe("accepted");
    expect(g.status).toBe("finished");
    expect(g.result).toBe("draw");
    expect(g.winnerId).toBeNull();
  });

  it("does not let the offering side accept its own offer", () => {
    const g = makeGame();
    g.respondDraw(WHITE, T0 + 1);
    expect(g.respondDraw(WHITE, T0 + 2)).toBe("offered");
    expect(g.status).toBe("active");
  });

  it("clears a pending draw offer once a move is played", () => {
    const g = makeGame();
    g.respondDraw(BLACK, T0 + 1);
    g.applyMove(WHITE, { from: "e2", to: "e4" }, T0 + 2);
    expect(g.drawOfferedBy).toBeNull();
  });

  it("aborts only before any move, and never sets a winner", () => {
    const g = makeGame();
    expect(g.abort(T0 + 1)).toMatchObject({ result: "aborted", winnerId: null });

    const played = makeGame();
    played.applyMove(WHITE, { from: "e2", to: "e4" }, T0 + 1);
    expect(played.abort(T0 + 2)).toBeNull();
  });
});

describe("hydration and reconnect", () => {
  it("rebuilds position, history and repetition awareness from the move log", () => {
    const g = makeGame({ sanHistory: ["e4", "e5", "Nf3"], fen: fenAfter(["e4", "e5", "Nf3"]) });
    expect(g.turn).toBe("b");
    // History is real, so the PGN reflects all three plies.
    expect(g.pgn).toContain("1. e4 e5 2. Nf3");
  });

  it("falls back to the stored FEN when the move log does not replay", () => {
    const stored = fenAfter(["d4"]);
    // A log that cannot produce `stored` must not be trusted over it.
    const g = makeGame({ sanHistory: ["e4", "e5"], fen: stored });
    expect(g.fen).toBe(stored);
    // PGN is withheld rather than emitting a misleading fragment.
    expect(g.pgn).toBeNull();
  });

  it("resumes the clock from banked time and the last move instant", () => {
    // 30s were banked and 5s have elapsed since white's turn began.
    const g = makeGame({ whiteTimeMs: 30_000, lastMoveAt: T0 - 5_000 }, T0);
    expect(g.msUntilFlag(T0)).toBe(25_000);
  });

  it("keeps a finished game readable after hydration", () => {
    const g = makeGame({
      status: "finished",
      result: "white",
      endReason: "resignation",
      winnerId: WHITE,
    });
    expect(g.terminalPayload()).toMatchObject({ result: "white", winnerId: WHITE });
    expect(g.clockSnapshot().running).toBeNull();
  });
});

describe("seating", () => {
  it("maps users to their colour and rejects everyone else", () => {
    const g = makeGame();
    expect(g.seatOf(WHITE)).toBe("w");
    expect(g.seatOf(BLACK)).toBe("b");
    expect(g.seatOf(STRANGER)).toBeNull();
    expect(g.seatOf(null)).toBeNull();
  });
});

function fenAfter(sans: string[]): string {
  const c = new Chess();
  for (const san of sans) c.move(san);
  return c.fen();
}
