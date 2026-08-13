// @vitest-environment jsdom
// =====================================================================
// Reconnect / rejoin regressions for the live transport.
//
// The socket module is doubled so the test can drive disconnects,
// reconnects and server answers deterministically. Everything else — the
// hook, its listeners, its reconciliation — is the real thing.
// =====================================================================
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GameStateSnapshot } from "../protocol";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── Socket double ─────────────────────────────────────────────────────

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  connected = false;
  readonly handlers = new Map<string, Set<Handler>>();
  readonly emitted: Array<{ event: string; payload: unknown }> = [];

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }
  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }
  emit(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
    return this;
  }
  /** How many listeners the hook currently holds for an event. */
  count(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
  fire(event: string, ...args: unknown[]) {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(...args);
  }
}

let socket: FakeSocket;
/** Every request the hook sent, in order. */
let requests: Array<{ event: string; payload: unknown }>;
/** What the fake server answers a `game:join` / `game:resync` with. */
let serverState: GameStateSnapshot;
let joinRejection: string | null;

/**
 * Joins parked here instead of answering, so a test can hold a request
 * open across a disconnect — the case a dead socket actually produces.
 */
let heldJoins: Array<{
  resolve: (s: GameStateSnapshot) => void;
  reject: (e: Error) => void;
}> = [];
let holdJoins = false;

vi.mock("./socket", () => ({
  getSocket: () => socket,
  ensureConnected: () => {
    if (!socket.connected) {
      socket.connected = true;
      socket.fire("connect");
    }
    return socket;
  },
  request: (event: string, payload: unknown) => {
    requests.push({ event, payload });
    if ((event === "game:join" || event === "game:resync") && joinRejection) {
      return Promise.reject(new Error(joinRejection));
    }
    if (event === "game:join" && holdJoins) {
      return new Promise((resolve, reject) => {
        heldJoins.push({ resolve: resolve as (s: GameStateSnapshot) => void, reject });
      });
    }
    if (event === "game:join" || event === "game:resync") {
      return Promise.resolve(structuredClone(serverState));
    }
    return Promise.resolve({});
  },
  syncClock: () => Promise.resolve(0),
  serverNow: () => Date.now(),
  getClockOffsetMs: () => 0,
}));

// Imported after the mock so the hook binds to the double.
const { useLiveGame } = await import("./useLiveGame");
type LiveApi = ReturnType<typeof useLiveGame>;

const GAME_ID = "game-a";
const ME = "player-me";
const THEM = "player-them";

function snapshot(overrides: Partial<GameStateSnapshot> = {}): GameStateSnapshot {
  return {
    gameId: GAME_ID,
    status: "active",
    result: "ongoing",
    endReason: null,
    winnerId: null,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    turn: "w",
    moves: [],
    clock: {
      whiteMs: 300_000,
      blackMs: 300_000,
      running: "w",
      since: 1_000,
      incrementMs: 0,
      untimed: false,
    },
    white: { userId: ME, username: "me", rating: 1500 },
    black: { userId: THEM, username: "them", rating: 1520 },
    drawOfferedBy: null,
    chat: [],
    isRated: true,
    timeControl: "5+0",
    moveDeadlineAt: null,
    moveDeadlineSeconds: null,
    delaySeconds: 0,
    serverTime: 2_000,
    ...overrides,
  };
}

function move(ply: number, san: string, fenAfter: string) {
  return {
    ply,
    san,
    uci: "e2e4",
    from: "e2",
    to: "e4",
    fenAfter,
    at: 1_000 + ply,
    tookMs: 500,
    by: ply % 2 === 1 ? ME : THEM,
  };
}

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

// ── Harness ───────────────────────────────────────────────────────────

let container: HTMLDivElement;
let root: Root;
let api: LiveApi;
let renders = 0;

function Harness({ gameId }: { gameId: string | null }) {
  api = useLiveGame(gameId);
  renders++;
  return null;
}

async function mount(gameId: string | null = GAME_ID) {
  await act(async () => {
    root.render(<Harness gameId={gameId} />);
  });
}

/** Drive a full drop-and-recover cycle through the socket double. */
async function dropAndRecover() {
  await act(async () => {
    socket.connected = false;
    socket.fire("disconnect");
  });
  await act(async () => {
    socket.connected = true;
    socket.fire("connect");
  });
}

beforeEach(() => {
  socket = new FakeSocket();
  requests = [];
  heldJoins = [];
  holdJoins = false;
  joinRejection = null;
  serverState = snapshot();
  renders = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

// ── Connection lifecycle ──────────────────────────────────────────────

describe("realtime reconnect", () => {
  it("joins once on first connect and reports the connection live", async () => {
    await mount();
    expect(requests.filter((r) => r.event === "game:join")).toHaveLength(1);
    expect(api.connection).toBe("live");
    expect(api.ready).toBe(true);
  });

  it("shows Reconnecting… on a drop, and recovers on its own", async () => {
    await mount();
    await act(async () => {
      socket.connected = false;
      socket.fire("disconnect");
    });
    expect(api.connection).toBe("reconnecting");

    await act(async () => {
      socket.connected = true;
      socket.fire("connect");
    });
    expect(api.connection).toBe("live");
  });

  it("re-joins the SAME game id on reconnect and never asks for a new one", async () => {
    await mount();
    await dropAndRecover();

    const joins = requests.filter((r) => r.event === "game:join");
    expect(joins).toHaveLength(2);
    for (const join of joins) expect(join.payload).toEqual({ gameId: GAME_ID });
    // Nothing in the transport can create a game; assert it never tried.
    expect(requests.some((r) => r.event.includes("create"))).toBe(false);
  });

  it("holds exactly one listener per server event across repeated reconnects", async () => {
    await mount();
    const baseline = {
      move: socket.count("game:move"),
      end: socket.count("game:end"),
      chat: socket.count("game:chat"),
      connect: socket.count("connect"),
      disconnect: socket.count("disconnect"),
    };
    expect(baseline.move).toBe(1);

    for (let i = 0; i < 4; i++) await dropAndRecover();

    expect(socket.count("game:move")).toBe(baseline.move);
    expect(socket.count("game:end")).toBe(baseline.end);
    expect(socket.count("game:chat")).toBe(baseline.chat);
    expect(socket.count("connect")).toBe(baseline.connect);
    expect(socket.count("disconnect")).toBe(baseline.disconnect);
  });

  it("removes every listener when the board unmounts", async () => {
    await mount();
    await act(async () => root.unmount());
    for (const event of ["game:move", "game:end", "game:chat", "connect", "disconnect"]) {
      expect(socket.count(event)).toBe(0);
    }
    // Recreate for the shared afterEach teardown.
    root = createRoot(container);
  });

  it("applies a broadcast move exactly once even if it arrives twice", async () => {
    await mount();
    const payload = {
      gameId: GAME_ID,
      move: move(1, "e4", AFTER_E4),
      clock: { ...serverState.clock, running: "b" as const },
      moveDeadlineAt: null,
    };
    await act(async () => {
      socket.fire("game:move", payload);
      socket.fire("game:move", payload);
    });
    expect(api.snapshot?.moves).toHaveLength(1);
    expect(api.snapshot?.fen).toBe(AFTER_E4);
  });

  // Regression: a join issued on a socket that then dies used to block the
  // reconnect's join (dedupe was "is one in flight", full stop), and when
  // it eventually timed out it reported failure for a connection that had
  // already recovered — leaving a connected board stuck on "Connection
  // lost". Both halves are scoped to a connection epoch now.
  it("re-joins on reconnect even while a join from the dead socket is still open", async () => {
    holdJoins = true;
    await mount();
    expect(heldJoins).toHaveLength(1); // first join, never answered

    await act(async () => {
      socket.connected = false;
      socket.fire("disconnect");
    });
    // The new connection must ask again rather than wait on the dead one.
    holdJoins = false;
    serverState = snapshot({ fen: AFTER_E4, turn: "b", moves: [move(1, "e4", AFTER_E4)] });
    await act(async () => {
      socket.connected = true;
      socket.fire("connect");
    });

    expect(requests.filter((r) => r.event === "game:join")).toHaveLength(2);
    expect(api.connection).toBe("live");
    expect(api.snapshot?.moves).toHaveLength(1);
  });

  it("ignores the late failure of a join belonging to a dead connection", async () => {
    holdJoins = true;
    await mount();
    const stale = heldJoins[0];

    await act(async () => {
      socket.connected = false;
      socket.fire("disconnect");
    });
    holdJoins = false;
    await act(async () => {
      socket.connected = true;
      socket.fire("connect");
    });
    expect(api.connection).toBe("live");

    // The abandoned request finally times out. It must not speak for the
    // connection that replaced it.
    await act(async () => {
      stale.reject(new Error("The server did not respond — check your connection."));
    });
    expect(api.connection).toBe("live");
    expect(api.error).toBeNull();
  });

  it("ignores the late success of a join belonging to a dead connection", async () => {
    holdJoins = true;
    await mount();
    const stale = heldJoins[0];

    await act(async () => {
      socket.connected = false;
      socket.fire("disconnect");
    });
    holdJoins = false;
    // The live connection sees the real, current position.
    serverState = snapshot({
      fen: AFTER_E4_E5,
      turn: "w",
      moves: [move(1, "e4", AFTER_E4), move(2, "e5", AFTER_E4_E5)],
    });
    await act(async () => {
      socket.connected = true;
      socket.fire("connect");
    });
    expect(api.snapshot?.moves).toHaveLength(2);

    // The dead socket's answer arrives late with an older board. Applying
    // it would rewind the game.
    await act(async () => {
      stale.resolve(snapshot({ fen: AFTER_E4, turn: "b", moves: [move(1, "e4", AFTER_E4)] }));
    });
    expect(api.snapshot?.moves).toHaveLength(2);
    expect(api.snapshot?.fen).toBe(AFTER_E4_E5);
  });

  it("a refresh re-enters the same game rather than starting one", async () => {
    await mount();
    serverState = snapshot({
      fen: AFTER_E4_E5,
      turn: "w",
      moves: [move(1, "e4", AFTER_E4), move(2, "e5", AFTER_E4_E5)],
    });

    // A refresh is a teardown and a fresh mount against the same id —
    // which is also what opening /game/<id> directly does.
    await act(async () => root.unmount());
    root = createRoot(container);
    requests = [];
    await mount();

    const joins = requests.filter((r) => r.event === "game:join");
    expect(joins).toHaveLength(1);
    expect(joins[0].payload).toEqual({ gameId: GAME_ID });
    expect(api.snapshot?.gameId).toBe(GAME_ID);
    expect(api.snapshot?.moves).toHaveLength(2);
    expect(api.snapshot?.fen).toBe(AFTER_E4_E5);
  });

  it("stays idempotent through repeated disconnect/reconnect churn", async () => {
    await mount();
    serverState = snapshot({
      fen: AFTER_E4,
      turn: "b",
      moves: [move(1, "e4", AFTER_E4)],
    });

    for (let i = 0; i < 5; i++) await dropAndRecover();

    expect(api.snapshot?.moves).toHaveLength(1);
    expect(api.snapshot?.fen).toBe(AFTER_E4);
    expect(api.connection).toBe("live");
  });
});

// ── Manual rejoin ─────────────────────────────────────────────────────

describe("connection lost → Rejoin Game", () => {
  it("gives up on the spinner after bounded retries and offers a manual rejoin", async () => {
    await mount();
    await act(async () => {
      socket.connected = false;
      socket.fire("disconnect");
    });

    // Five failures is still "reconnecting"; the sixth flips to offline.
    for (let i = 0; i < 5; i++) {
      await act(async () => socket.fire("connect_error", new Error("boom")));
      expect(api.connection).toBe("reconnecting");
    }
    await act(async () => socket.fire("connect_error", new Error("boom")));
    expect(api.connection).toBe("offline");
  });

  it("restores the existing game — same id, no new game — when Rejoin is pressed", async () => {
    await mount();
    await act(async () => {
      socket.connected = false;
      socket.fire("disconnect");
      for (let i = 0; i < 6; i++) socket.fire("connect_error", new Error("boom"));
    });
    expect(api.connection).toBe("offline");

    serverState = snapshot({
      fen: AFTER_E4_E5,
      turn: "w",
      moves: [move(1, "e4", AFTER_E4), move(2, "e5", AFTER_E4_E5)],
    });

    const joinsBefore = requests.filter((r) => r.event === "game:join").length;
    await act(async () => {
      await api.rejoin();
    });

    const joins = requests.filter((r) => r.event === "game:join");
    expect(joins.length).toBe(joinsBefore + 1);
    expect(joins.at(-1)!.payload).toEqual({ gameId: GAME_ID });
    expect(api.connection).toBe("live");
    expect(api.snapshot?.gameId).toBe(GAME_ID);
    expect(api.snapshot?.moves).toHaveLength(2);
  });

  it("repeated Rejoin presses stay on one game and one subscription", async () => {
    await mount();
    const listenersBefore = socket.count("game:move");

    await act(async () => {
      await Promise.all([api.rejoin(), api.rejoin(), api.rejoin()]);
    });

    // The room listeners are owned by the effect, not by rejoin.
    expect(socket.count("game:move")).toBe(listenersBefore);
    // Every join names the same existing game.
    for (const join of requests.filter((r) => r.event === "game:join")) {
      expect(join.payload).toEqual({ gameId: GAME_ID });
    }
    expect(api.snapshot?.gameId).toBe(GAME_ID);
  });

  it("reports offline when the server refuses the rejoin", async () => {
    await mount();
    joinRejection = "Game not found";
    await act(async () => {
      await api.rejoin();
    });
    expect(api.connection).toBe("offline");
    expect(api.error).toBe("Game not found");
  });
});

// ── Authoritative state wins ──────────────────────────────────────────

describe("server state replaces stale client state", () => {
  it("replaces a stale board and move history with the server's", async () => {
    await mount();
    // Local state gets ahead of itself with a bogus position.
    await act(async () => {
      socket.fire("game:move", {
        gameId: GAME_ID,
        move: move(1, "e4", AFTER_E4),
        clock: serverState.clock,
        moveDeadlineAt: null,
      });
    });
    expect(api.snapshot?.moves).toHaveLength(1);

    // Meanwhile the real game went further; reconnect must adopt it whole.
    serverState = snapshot({
      fen: AFTER_E4_E5,
      turn: "w",
      moves: [move(1, "e4", AFTER_E4), move(2, "e5", AFTER_E4_E5)],
    });
    await dropAndRecover();

    expect(api.snapshot?.fen).toBe(AFTER_E4_E5);
    expect(api.snapshot?.moves.map((m) => m.san)).toEqual(["e4", "e5"]);
    expect(api.snapshot?.turn).toBe("w");
  });

  it("takes the clock from the server and never from local state", async () => {
    await mount();
    expect(api.snapshot?.clock.whiteMs).toBe(300_000);

    // The player was away; the server has been counting the whole time.
    serverState = snapshot({
      clock: {
        whiteMs: 12_345,
        blackMs: 250_000,
        running: "w",
        since: 99_000,
        incrementMs: 0,
        untimed: false,
      },
    });
    await dropAndRecover();

    // A refresh must never hand back the time that was already spent.
    expect(api.snapshot?.clock.whiteMs).toBe(12_345);
    expect(api.snapshot?.clock.blackMs).toBe(250_000);
    expect(api.snapshot?.clock.since).toBe(99_000);
  });

  it("restores the player's colour, the side to move and the game status", async () => {
    await mount();
    serverState = snapshot({
      status: "active",
      fen: AFTER_E4,
      turn: "b",
      moves: [move(1, "e4", AFTER_E4)],
      white: { userId: THEM, username: "them", rating: 1520 },
      black: { userId: ME, username: "me", rating: 1500 },
    });
    await dropAndRecover();

    expect(api.snapshot?.black.userId).toBe(ME);
    expect(api.snapshot?.white.userId).toBe(THEM);
    expect(api.snapshot?.turn).toBe("b");
    expect(api.snapshot?.status).toBe("active");
  });

  it("restores an opponent move played while the player was away", async () => {
    await mount();
    await act(async () => {
      socket.connected = false;
      socket.fire("disconnect");
    });

    serverState = snapshot({
      fen: AFTER_E4_E5,
      turn: "w",
      moves: [move(1, "e4", AFTER_E4), move(2, "e5", AFTER_E4_E5)],
    });

    await act(async () => {
      socket.connected = true;
      socket.fire("connect");
    });

    expect(api.snapshot?.moves.map((m) => m.san)).toEqual(["e4", "e5"]);
    expect(api.snapshot?.fen).toBe(AFTER_E4_E5);
  });

  it("carries a finished result through and does not show the game as live", async () => {
    await mount();
    serverState = snapshot({
      status: "finished",
      result: "black",
      endReason: "resignation",
      winnerId: THEM,
      clock: { ...serverState.clock, running: null },
    });
    await dropAndRecover();

    expect(api.snapshot?.status).toBe("finished");
    expect(api.snapshot?.result).toBe("black");
    expect(api.snapshot?.endReason).toBe("resignation");
  });

  it("asks for a resync rather than stitching a gapped move list", async () => {
    await mount();
    await act(async () => {
      // Ply 3 with nothing before it: a gap, not a move to apply.
      socket.fire("game:move", {
        gameId: GAME_ID,
        move: move(3, "Nf3", AFTER_E4_E5),
        clock: serverState.clock,
        moveDeadlineAt: null,
      });
    });
    expect(requests.some((r) => r.event === "game:resync")).toBe(true);
  });
});

// ── Move reconciliation ───────────────────────────────────────────────

describe("move reconciliation across a disconnect", () => {
  it("drops the optimistic move in favour of the server's answer — accepted case", async () => {
    await mount();
    await act(async () => {
      void api.move("e2", "e4");
    });
    expect(api.pending).not.toBeNull();

    // The server did accept it before the socket dropped.
    serverState = snapshot({ fen: AFTER_E4, turn: "b", moves: [move(1, "e4", AFTER_E4)] });
    await dropAndRecover();

    expect(api.pending).toBeNull();
    expect(api.snapshot?.moves).toHaveLength(1);
    // Not resubmitted: the only game:move request is the original one.
    expect(requests.filter((r) => r.event === "game:move")).toHaveLength(1);
    expect(api.activeFen).toBe(AFTER_E4);
  });

  it("drops the optimistic move in favour of the server's answer — rejected case", async () => {
    await mount();
    await act(async () => {
      void api.move("e2", "e4");
    });
    expect(api.pending).not.toBeNull();

    // The move never landed: the server's history is still empty.
    await dropAndRecover();

    expect(api.pending).toBeNull();
    expect(api.snapshot?.moves).toHaveLength(0);
    expect(api.snapshot?.fen).toBe(serverState.fen);
    // And it was not silently replayed.
    expect(requests.filter((r) => r.event === "game:move")).toHaveLength(1);
  });

  it("snaps back to the truth when the server refuses a move", async () => {
    await mount();
    await act(async () => {
      void api.move("e2", "e4");
    });
    await act(async () => {
      socket.fire("game:rejected", {
        gameId: GAME_ID,
        code: "not_your_turn",
        message: "Not your turn",
        snapshot: snapshot({ fen: AFTER_E4_E5, turn: "w", moves: [] }),
      });
    });
    expect(api.pending).toBeNull();
    expect(api.snapshot?.fen).toBe(AFTER_E4_E5);
    expect(api.error).toBe("Not your turn");
  });
});

// ── Cost ──────────────────────────────────────────────────────────────

describe("performance", () => {
  it("does not re-render on every reconnect beyond the state changes it causes", async () => {
    await mount();
    const before = renders;
    await dropAndRecover();
    // disconnect -> reconnecting, connect -> live, join -> snapshot.
    expect(renders - before).toBeLessThanOrEqual(4);
  });

  it("issues one join per connection, not one per render", async () => {
    await mount();
    await act(async () => {
      root.render(<Harness gameId={GAME_ID} />);
      root.render(<Harness gameId={GAME_ID} />);
    });
    expect(requests.filter((r) => r.event === "game:join")).toHaveLength(1);
  });
});
