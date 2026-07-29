import { describe, expect, it } from "vitest";

import { MATE_CP } from "@/lib/engine/uci";

import { gameAccuracy, moveAccuracy, winProbability } from "./accuracy";

describe("winProbability", () => {
  it("is 50% for an equal position and symmetric around it", () => {
    expect(winProbability(0)).toBe(50);
    expect(winProbability(200) + winProbability(-200)).toBeCloseTo(100, 6);
  });

  it("increases with the eval", () => {
    expect(winProbability(100)).toBeGreaterThan(winProbability(0));
    expect(winProbability(500)).toBeGreaterThan(winProbability(100));
  });

  it("rails at mate scores", () => {
    expect(winProbability(MATE_CP - 3)).toBe(100);
    expect(winProbability(-MATE_CP + 5)).toBe(0);
  });
});

describe("moveAccuracy", () => {
  it("is 100 when the win probability holds or improves", () => {
    expect(moveAccuracy(55, 55)).toBe(100);
    expect(moveAccuracy(40, 60)).toBe(100);
  });

  it("decays with the size of the drop", () => {
    const small = moveAccuracy(60, 58);
    const medium = moveAccuracy(60, 45);
    const large = moveAccuracy(60, 15);
    expect(small).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(large);
    expect(large).toBeGreaterThanOrEqual(0);
    expect(small).toBeLessThanOrEqual(100);
  });
});

describe("gameAccuracy", () => {
  it("returns null with no moves", () => {
    expect(gameAccuracy([])).toBeNull();
  });

  it("penalises a single disaster more than the plain mean", () => {
    const steady = gameAccuracy([90, 90, 90, 90]);
    const spiky = gameAccuracy([100, 100, 100, 20]);
    // Same-ish arithmetic mean (90 vs 80) but the harmonic component
    // should drag the spiky game well below the steady one.
    expect(steady).not.toBeNull();
    expect(spiky).not.toBeNull();
    expect(spiky!).toBeLessThan(steady!);
    expect(spiky!).toBeLessThan(80);
  });

  it("caps at 100", () => {
    expect(gameAccuracy([100, 100])).toBe(100);
  });
});
