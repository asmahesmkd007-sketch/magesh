import { describe, expect, it } from "vitest";

import {
  clockFromServer,
  createClock,
  flagged,
  isUntimed,
  msToNextTick,
  press,
  remainingMs,
  restoreClock,
  startTurn,
  stop,
} from "./clock";

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe("createClock", () => {
  it("gives both sides the same starting time and runs nobody", () => {
    const c = createClock({ initialMs: 5 * MIN });
    expect(c.whiteMs).toBe(5 * MIN);
    expect(c.blackMs).toBe(5 * MIN);
    expect(c.running).toBeNull();
  });

  it("treats a zero initial time as untimed", () => {
    expect(isUntimed(createClock({ initialMs: 0 }))).toBe(true);
    expect(isUntimed(createClock({ initialMs: MIN }))).toBe(false);
  });
});

describe("remainingMs", () => {
  it("only counts down for the running side", () => {
    const c = startTurn(createClock({ initialMs: 5 * MIN }), "w", T0);
    expect(remainingMs(c, "w", T0 + 10_000)).toBe(5 * MIN - 10_000);
    expect(remainingMs(c, "b", T0 + 10_000)).toBe(5 * MIN);
  });

  it("never returns a negative value", () => {
    const c = startTurn(createClock({ initialMs: 1_000 }), "w", T0);
    expect(remainingMs(c, "w", T0 + 999_999)).toBe(0);
  });

  it("is pure — reading does not advance the clock", () => {
    const c = startTurn(createClock({ initialMs: MIN }), "w", T0);
    const snapshot = { ...c };
    remainingMs(c, "w", T0 + 30_000);
    remainingMs(c, "w", T0 + 45_000);
    expect(c).toEqual(snapshot);
  });

  // The property the old tick-accumulating clock could not hold.
  it("does not drift across many reads at irregular intervals", () => {
    const c = startTurn(createClock({ initialMs: 10 * MIN }), "w", T0);
    let t = T0;
    for (const step of [7, 113, 999, 3, 1_501, 47, 250]) {
      t += step;
      remainingMs(c, "w", t);
    }
    // Whatever the read pattern, the answer depends only on wall-clock.
    expect(remainingMs(c, "w", t)).toBe(10 * MIN - (t - T0));
  });

  it("is unaffected by a backgrounded tab (no ticks at all)", () => {
    const c = startTurn(createClock({ initialMs: 3 * MIN }), "w", T0);
    // Simulate five minutes with zero intervening reads.
    expect(remainingMs(c, "w", T0 + 5 * MIN)).toBe(0);
  });
});

describe("press — increments", () => {
  it("adds the Fischer increment to the mover and passes the turn", () => {
    let c = createClock({ initialMs: 3 * MIN, incrementMs: 2_000 });
    c = startTurn(c, "w", T0);
    c = press(c, T0 + 10_000);
    expect(c.whiteMs).toBe(3 * MIN - 10_000 + 2_000);
    expect(c.running).toBe("b");
    expect(remainingMs(c, "b", T0 + 10_000)).toBe(3 * MIN);
  });

  it("does not cap the increment at the starting time", () => {
    // A 1+2 game: moving instantly must be able to grow the bank above 60s.
    let c = createClock({ initialMs: MIN, incrementMs: 2_000 });
    for (let i = 0; i < 5; i++) {
      c = startTurn(c, "w", T0 + i * 100);
      c = press(c, T0 + i * 100 + 10);
    }
    expect(c.whiteMs).toBeGreaterThan(MIN);
  });

  it("grants no increment to a side that has already flagged", () => {
    let c = createClock({ initialMs: 5_000, incrementMs: 3_000 });
    c = startTurn(c, "w", T0);
    c = press(c, T0 + 9_000);
    expect(c.whiteMs).toBe(0);
  });

  it("is a no-op when the clock is stopped", () => {
    const c = createClock({ initialMs: MIN });
    expect(press(c, T0)).toEqual(c);
  });
});

describe("press — delay", () => {
  it("charges nothing while the delay is unspent", () => {
    let c = createClock({ initialMs: 3 * MIN, delayMs: 5_000 });
    c = startTurn(c, "w", T0);
    expect(remainingMs(c, "w", T0 + 3_000)).toBe(3 * MIN);
    expect(remainingMs(c, "w", T0 + 5_000)).toBe(3 * MIN);
  });

  it("charges only the time beyond the delay", () => {
    let c = createClock({ initialMs: 3 * MIN, delayMs: 5_000 });
    c = startTurn(c, "w", T0);
    expect(remainingMs(c, "w", T0 + 8_000)).toBe(3 * MIN - 3_000);
    c = press(c, T0 + 8_000);
    expect(c.whiteMs).toBe(3 * MIN - 3_000);
  });

  it("restarts the delay allowance every turn", () => {
    let c = createClock({ initialMs: 3 * MIN, delayMs: 5_000 });
    c = startTurn(c, "w", T0);
    c = press(c, T0 + 8_000); // white charged 3s
    c = press(c, T0 + 12_000); // black used 4s, all within its own delay
    expect(c.blackMs).toBe(3 * MIN);
  });
});

describe("flagged", () => {
  it("flags only the side whose clock is running", () => {
    const c = startTurn(createClock({ initialMs: 1_000 }), "w", T0);
    expect(flagged(c, T0 + 500)).toBeNull();
    expect(flagged(c, T0 + 1_000)).toBe("w");
    expect(flagged(c, T0 + 5_000)).toBe("w");
  });

  it("never flags a stopped clock", () => {
    const c = stop(startTurn(createClock({ initialMs: 1_000 }), "w", T0), T0 + 500);
    expect(flagged(c, T0 + 999_999)).toBeNull();
  });

  it("never flags an untimed game", () => {
    const c = startTurn(createClock({ initialMs: 0 }), "w", T0);
    expect(flagged(c, T0 + 999_999)).toBeNull();
  });
});

describe("stop", () => {
  it("banks the running side's remaining time and freezes it", () => {
    let c = startTurn(createClock({ initialMs: 2 * MIN }), "b", T0);
    c = stop(c, T0 + 20_000);
    expect(c.running).toBeNull();
    expect(c.blackMs).toBe(2 * MIN - 20_000);
    expect(remainingMs(c, "b", T0 + 999_999)).toBe(2 * MIN - 20_000);
  });
});

describe("startTurn", () => {
  it("banks the previous side's time when the turn changes", () => {
    let c = startTurn(createClock({ initialMs: MIN }), "w", T0);
    c = startTurn(c, "b", T0 + 15_000);
    expect(c.whiteMs).toBe(MIN - 15_000);
    expect(c.running).toBe("b");
  });
});

describe("restoreClock — refresh and reconnect", () => {
  it("accounts for wall-clock elapsed while the page was gone", () => {
    const before = startTurn(createClock({ initialMs: 5 * MIN }), "w", T0);
    // Serialise/deserialise, as a refresh would.
    const after = restoreClock(JSON.parse(JSON.stringify(before)), T0 + 30_000);
    expect(remainingMs(after, "w", T0 + 30_000)).toBe(5 * MIN - 30_000);
  });

  it("pulls a future timestamp back to now rather than burning the bank", () => {
    const skewed = startTurn(createClock({ initialMs: 5 * MIN }), "w", T0 + 60_000);
    const restored = restoreClock(skewed, T0);
    expect(remainingMs(restored, "w", T0)).toBe(5 * MIN);
  });

  it("leaves a stopped clock untouched", () => {
    const c = createClock({ initialMs: MIN });
    expect(restoreClock(c, T0)).toEqual(c);
  });
});

describe("clockFromServer", () => {
  const row = {
    whiteTimeMs: 5 * MIN,
    blackTimeMs: 5 * MIN,
    turn: "w",
    lastMoveAt: new Date(T0).toISOString(),
    isActive: true,
    initialSeconds: 300,
    incrementSeconds: 3,
  };

  it("treats the stored times as banked as of last_move_at", () => {
    const c = clockFromServer(row);
    expect(c.running).toBe("w");
    expect(c.since).toBe(T0);
    expect(c.whiteMs).toBe(5 * MIN);
  });

  // The double-speed regression: elapsed must be applied exactly once.
  it("subtracts the elapsed time exactly once", () => {
    const c = clockFromServer(row);
    expect(remainingMs(c, "w", T0 + 30_000)).toBe(5 * MIN - 30_000);
    // Not 5*MIN - 60_000, which is what subtracting elapsed both in the
    // route and again in the player card produced.
    expect(remainingMs(c, "w", T0 + 30_000)).not.toBe(5 * MIN - 60_000);
  });

  it("leaves the idle side untouched", () => {
    const c = clockFromServer(row);
    expect(remainingMs(c, "b", T0 + 30_000)).toBe(5 * MIN);
  });

  it("stops the clock for a finished game", () => {
    const c = clockFromServer({ ...row, isActive: false });
    expect(c.running).toBeNull();
    expect(flagged(c, T0 + 999_999)).toBeNull();
  });

  it("carries the increment through to press()", () => {
    const c = press(clockFromServer(row), T0 + 10_000);
    expect(c.whiteMs).toBe(5 * MIN - 10_000 + 3_000);
    expect(c.running).toBe("b");
  });

  it("marks a zero initial time as untimed", () => {
    expect(clockFromServer({ ...row, initialSeconds: 0 }).untimed).toBe(true);
    expect(clockFromServer({ ...row, initialSeconds: 300 }).untimed).toBe(false);
  });

  it("tolerates a missing or unparseable last_move_at", () => {
    for (const bad of [null, "not-a-date"]) {
      const c = clockFromServer({ ...row, lastMoveAt: bad as string | null });
      expect(Number.isFinite(c.since)).toBe(true);
      expect(remainingMs(c, "w", c.since)).toBe(5 * MIN);
    }
  });

  it("accepts an epoch-millisecond timestamp directly", () => {
    expect(clockFromServer({ ...row, lastMoveAt: T0 }).since).toBe(T0);
  });
});

describe("msToNextTick", () => {
  it("repaints once per second above the tenths threshold", () => {
    expect(msToNextTick(65_400, false)).toBe(400);
    expect(msToNextTick(65_000, false)).toBe(1000);
  });

  it("repaints ten times per second under ten seconds when tenths are shown", () => {
    expect(msToNextTick(9_450, true)).toBe(50);
    expect(msToNextTick(9_400, true)).toBe(100);
  });

  it("ignores tenths above the threshold", () => {
    expect(msToNextTick(30_450, true)).toBe(450);
  });

  it("stops scheduling once the clock is dead", () => {
    expect(msToNextTick(0, true)).toBe(Number.POSITIVE_INFINITY);
  });
});
