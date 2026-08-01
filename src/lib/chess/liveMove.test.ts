import { Chess } from "chess.js";
import { describe, expect, it, vi } from "vitest";

import {
  acceptLiveMove,
  sendLiveMove,
  LIVE_MOVE_EVENT,
  type LiveMoveContext,
  type LiveMovePayload,
} from "./liveMove";

const WHITE = "11111111-1111-1111-1111-111111111111";
const BLACK = "22222222-2222-2222-2222-222222222222";
const START = new Chess().fen();

function ctx(over: Partial<LiveMoveContext> = {}): LiveMoveContext {
  return {
    status: "active",
    fen: START,
    movesCount: 0,
    whiteId: WHITE,
    blackId: BLACK,
    viewerId: BLACK,
    ...over,
  };
}

/** A well-formed relay for White's opening move from `fen`. */
function payload(over: Partial<LiveMovePayload> = {}): LiveMovePayload {
  const c = new Chess();
  c.move({ from: "e2", to: "e4" });
  return {
    ply: 1,
    from: "e2",
    to: "e4",
    fenBefore: START,
    fenAfter: c.fen(),
    at: 1_000,
    by: WHITE,
    ...over,
  };
}

describe("acceptLiveMove — the happy path", () => {
  it("accepts the next ply from the seated side to move", () => {
    const got = acceptLiveMove(payload(), ctx(), 1_000);
    expect(got).not.toBeNull();
    expect(got!.san).toBe("e4");
    expect(got!.ply).toBe(1);
    expect(got!.from).toBe("e2");
    expect(got!.to).toBe("e4");
  });

  it("re-derives the position rather than echoing the sender's FEN", () => {
    const c = new Chess();
    c.move({ from: "e2", to: "e4" });
    const got = acceptLiveMove(payload(), ctx(), 1_000);
    expect(got!.fen).toBe(c.fen());
    // The resulting instance is handed back for terminal detection.
    expect(got!.chess.turn()).toBe("b");
  });

  it("carries promotions", () => {
    const fen = "8/P6k/8/8/8/8/7K/8 w - - 0 1";
    const c = new Chess(fen);
    c.move({ from: "a7", to: "a8", promotion: "q" });
    const got = acceptLiveMove(
      payload({ ply: 41, from: "a7", to: "a8", promotion: "q", fenBefore: fen, fenAfter: c.fen() }),
      ctx({ fen, movesCount: 40 }),
      1_000,
    );
    expect(got!.san).toBe("a8=Q");
  });
});

describe("acceptLiveMove — a relayed move can never get ahead of the truth", () => {
  it("rejects a ply that is not exactly the next one", () => {
    for (const ply of [0, 2, 3, -1, 99]) {
      expect(acceptLiveMove(payload({ ply }), ctx(), 1_000)).toBeNull();
    }
  });

  it("rejects a move played from a position we do not hold", () => {
    const stale = new Chess();
    stale.move("d4");
    expect(acceptLiveMove(payload({ fenBefore: stale.fen() }), ctx(), 1_000)).toBeNull();
  });

  it("rejects a claimed result that does not match the local replay", () => {
    const lie = new Chess();
    lie.move("d4");
    expect(acceptLiveMove(payload({ fenAfter: lie.fen() }), ctx(), 1_000)).toBeNull();
  });

  it("rejects an illegal move", () => {
    expect(acceptLiveMove(payload({ from: "e2", to: "e5" }), ctx(), 1_000)).toBeNull();
  });
});

describe("acceptLiveMove — a relayed move can never come from the wrong player", () => {
  it("rejects a sender who is not the side to move", () => {
    // Black relaying a move while it is White's turn.
    expect(acceptLiveMove(payload({ by: BLACK }), ctx({ viewerId: WHITE }), 1_000)).toBeNull();
  });

  it("rejects a sender who is not seated in the game", () => {
    const stranger = "33333333-3333-3333-3333-333333333333";
    expect(acceptLiveMove(payload({ by: stranger }), ctx(), 1_000)).toBeNull();
  });

  it("drops our own echo", () => {
    expect(acceptLiveMove(payload(), ctx({ viewerId: WHITE }), 1_000)).toBeNull();
  });

  it("rejects anything at all once the game is not active", () => {
    for (const status of ["waiting", "finished", "aborted", null, undefined]) {
      expect(acceptLiveMove(payload(), ctx({ status }), 1_000)).toBeNull();
    }
  });
});

describe("acceptLiveMove — malformed payloads", () => {
  it("rejects non-objects and missing fields", () => {
    for (const bad of [null, undefined, 0, "e2e4", [], {}]) {
      expect(acceptLiveMove(bad, ctx(), 1_000)).toBeNull();
    }
  });

  it("rejects squares and promotions outside the allowed sets", () => {
    expect(acceptLiveMove(payload({ from: "z9" }), ctx(), 1_000)).toBeNull();
    expect(acceptLiveMove(payload({ to: "e44" }), ctx(), 1_000)).toBeNull();
    expect(acceptLiveMove(payload({ promotion: "k" as unknown as "q" }), ctx(), 1_000)).toBeNull();
  });

  it("rejects a non-integer ply", () => {
    expect(acceptLiveMove(payload({ ply: 1.5 }), ctx(), 1_000)).toBeNull();
    expect(acceptLiveMove(payload({ ply: NaN }), ctx(), 1_000)).toBeNull();
  });
});

describe("acceptLiveMove — the relayed timestamp is clamped, never trusted", () => {
  it("never lets a peer place its move in the future", () => {
    const got = acceptLiveMove(payload({ at: 9_999_999 }), ctx(), 1_000);
    expect(got!.at).toBe(1_000);
  });

  it("never lets a peer backdate its move beyond the relay window", () => {
    const got = acceptLiveMove(payload({ at: 0 }), ctx(), 1_000_000);
    expect(got!.at).toBe(1_000_000 - 10_000);
  });

  it("falls back to our own clock when the timestamp is unusable", () => {
    const got = acceptLiveMove(payload({ at: NaN }), ctx(), 4_242);
    expect(got!.at).toBe(4_242);
  });
});

describe("sendLiveMove", () => {
  it("broadcasts on the shared event without awaiting an ack", () => {
    const send = vi.fn(() => Promise.resolve("ok"));
    sendLiveMove({ send }, payload());
    expect(send).toHaveBeenCalledWith({
      type: "broadcast",
      event: LIVE_MOVE_EVENT,
      payload: payload(),
    });
  });

  it("is a no-op without a channel, and swallows a failing send", () => {
    expect(() => sendLiveMove(null, payload())).not.toThrow();
    expect(() =>
      sendLiveMove(
        {
          send: () => {
            throw new Error("socket closed");
          },
        },
        payload(),
      ),
    ).not.toThrow();
  });
});
