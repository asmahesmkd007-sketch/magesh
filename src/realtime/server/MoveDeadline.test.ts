import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { LiveGame, type LiveGameInit } from "./LiveGame";

const WHITE = "11111111-1111-1111-1111-111111111111";
const BLACK = "22222222-2222-2222-2222-222222222222";
const T0 = 1_000_000_000;

function makeGame(initialSeconds: number, over: Partial<LiveGameInit> = {}, now = T0): LiveGame {
  const init: LiveGameInit = {
    gameId: "game-deadline-1",
    white: { userId: WHITE, username: "white", rating: 1500 },
    black: { userId: BLACK, username: "black", rating: 1500 },
    status: "active",
    result: "ongoing",
    endReason: null,
    winnerId: null,
    sanHistory: [],
    whiteTimeMs: initialSeconds * 1000,
    blackTimeMs: initialSeconds * 1000,
    lastMoveAt: now,
    initialSeconds,
    incrementSeconds: 0,
    isRated: true,
    timeControl: `${Math.round(initialSeconds / 60)}+0`,
    drawOfferedBy: null,
    chat: [],
    fen: new Chess().fen(),
    ...over,
  };
  return new LiveGame(init, now);
}

describe("Per-Move Response Deadline Configuration", () => {
  it("configures 30 seconds deadline for Bullet (<= 120s)", () => {
    const bullet1 = makeGame(60); // 1+0
    expect(bullet1.getMoveDeadlineSeconds()).toBe(30);

    const bullet2 = makeGame(120); // 2+0
    expect(bullet2.getMoveDeadlineSeconds()).toBe(30);
  });

  it("configures 60 seconds deadline for Blitz (121s - 600s)", () => {
    const blitz1 = makeGame(180); // 3+0
    expect(blitz1.getMoveDeadlineSeconds()).toBe(60);

    const blitz2 = makeGame(300); // 5+0
    expect(blitz2.getMoveDeadlineSeconds()).toBe(60);

    const blitz3 = makeGame(600); // 10+0
    expect(blitz3.getMoveDeadlineSeconds()).toBe(60);
  });

  it("configures 60 seconds deadline for Rapid (601s - 1800s)", () => {
    const rapid1 = makeGame(900); // 15+10
    expect(rapid1.getMoveDeadlineSeconds()).toBe(60);

    const rapid2 = makeGame(1800); // 30+0
    expect(rapid2.getMoveDeadlineSeconds()).toBe(60);
  });

  it("disables move deadline for Classical (> 1800s) and untimed games", () => {
    const classical = makeGame(3600); // 60+0
    expect(classical.getMoveDeadlineSeconds()).toBeNull();

    const untimed = makeGame(0);
    expect(untimed.getMoveDeadlineSeconds()).toBeNull();
  });
});

describe("Per-Move Response Deadline Gameplay & Alternating Turns", () => {
  it("grants White a 30s response deadline on game start for Bullet", () => {
    const g = makeGame(60, {}, T0);
    expect(g.moveDeadlineAt).toBe(T0 + 30_000);
    expect(g.msUntilMoveDeadline(T0)).toBe(30_000);
    expect(g.msUntilMoveDeadline(T0 + 10_000)).toBe(20_000);
  });

  it("resets Black's response deadline immediately after White moves", () => {
    const g = makeGame(180, {}, T0); // Blitz (60s)
    expect(g.moveDeadlineAt).toBe(T0 + 60_000);

    // White moves 10 seconds into turn
    const move1Time = T0 + 10_000;
    const out = g.applyMove(WHITE, { from: "e2", to: "e4" }, move1Time);
    expect(out.ok).toBe(true);

    // Now Black has a fresh 60s response deadline starting from move1Time
    expect(g.turn).toBe("b");
    expect(g.moveDeadlineAt).toBe(move1Time + 60_000);
    expect(g.msUntilMoveDeadline(move1Time)).toBe(60_000);
  });

  it("resets White's response deadline immediately after Black moves", () => {
    const g = makeGame(180, {}, T0);
    const t1 = T0 + 5_000;
    g.applyMove(WHITE, { from: "e2", to: "e4" }, t1);

    // Black moves 15 seconds after White
    const t2 = t1 + 15_000;
    const out = g.applyMove(BLACK, { from: "e7", to: "e5" }, t2);
    expect(out.ok).toBe(true);

    // White now has a fresh 60s response deadline from t2
    expect(g.turn).toBe("w");
    expect(g.moveDeadlineAt).toBe(t2 + 60_000);
  });
});

describe("Deadline Timeout & Auto-Abort Rules", () => {
  it("auto-aborts game if current player exceeds move response deadline", () => {
    const g = makeGame(60, {}, T0); // Bullet (30s)
    expect(g.status).toBe("active");

    // 30 seconds elapse with no move
    const term = g.checkMoveDeadline(T0 + 30_000);
    expect(term).not.toBeNull();
    expect(term?.result).toBe("aborted");
    expect(term?.endReason).toBe("move_deadline_exceeded");
    expect(term?.winnerId).toBeNull();
    expect(g.status).toBe("aborted");
  });

  it("rejects move submitted exactly after deadline expires", () => {
    const g = makeGame(60, {}, T0); // Bullet (30s)
    // White tries to move 31 seconds into game
    const out = g.applyMove(WHITE, { from: "e2", to: "e4" }, T0 + 31_000);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe("out_of_time");
      expect(out.terminal?.result).toBe("aborted");
      expect(out.terminal?.endReason).toBe("move_deadline_exceeded");
    }
    expect(g.status).toBe("aborted");
  });

  it("accepts move submitted right before deadline expires", () => {
    const g = makeGame(60, {}, T0); // Bullet (30s)
    // White moves at 29.9 seconds
    const out = g.applyMove(WHITE, { from: "e2", to: "e4" }, T0 + 29_900);
    expect(out.ok).toBe(true);
    expect(g.status).toBe("active");
  });

  it("guarantees auto-abort game does NOT set winner or trigger ELO / SP / IQ changes", () => {
    const g = makeGame(180, {}, T0);
    const term = g.checkMoveDeadline(T0 + 60_000);
    expect(term?.result).toBe("aborted");
    expect(term?.winnerId).toBeNull();
    expect(g.result).toBe("aborted");
    expect(g.winnerId).toBeNull();
  });
});

describe("Reconnect & Spectator Deadline Synchronization", () => {
  it("preserves original moveDeadlineAt timestamp on player reconnect", () => {
    const lastMove = T0 - 20_000;
    // Player re-hydrates game where 20s have already passed of a 60s Blitz deadline
    const reconnected = makeGame(180, { lastMoveAt: lastMove }, T0);
    expect(reconnected.moveDeadlineAt).toBe(lastMove + 60_000);
    expect(reconnected.msUntilMoveDeadline(T0)).toBe(40_000);
  });
});
