import { describe, expect, it } from "vitest";

import {
  BASE_RATING,
  ELO_BANDS,
  bandOf,
  expectedScore,
  kFactor,
  ratingDelta,
  ratingStakes,
  winRate,
} from "./elo";

describe("expectedScore", () => {
  it("is 0.5 between equals and symmetric", () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 10);
    expect(expectedScore(1600, 1400) + expectedScore(1400, 1600)).toBeCloseTo(1, 10);
  });

  it("rises with the rating gap", () => {
    expect(expectedScore(1800, 1400)).toBeGreaterThan(expectedScore(1600, 1400));
    expect(expectedScore(1400, 1800)).toBeLessThan(0.15);
  });

  it("matches the 400-point convention (~0.909)", () => {
    expect(expectedScore(1800, 1400)).toBeCloseTo(0.909, 3);
  });
});

describe("kFactor", () => {
  it("moves provisional players fastest", () => {
    expect(kFactor(1200, 0)).toBe(40);
    expect(kFactor(1200, 14)).toBe(40);
    expect(kFactor(1200, 15)).toBe(24);
  });

  it("slows down as rating rises", () => {
    expect(kFactor(1500, 50)).toBe(24);
    expect(kFactor(1900, 50)).toBe(20);
    expect(kFactor(2500, 50)).toBe(12);
  });
});

describe("ratingDelta", () => {
  it("rewards beating a stronger opponent more than a weaker one", () => {
    const upset = ratingDelta({ rating: 1400, opponentRating: 1800, outcome: "win" });
    const expected = ratingDelta({ rating: 1800, opponentRating: 1400, outcome: "win" });
    expect(upset).toBeGreaterThan(expected);
    expect(upset).toBeGreaterThan(0);
    expect(expected).toBeGreaterThan(0);
  });

  it("punishes losing to a weaker opponent more than to a stronger one", () => {
    const badLoss = ratingDelta({ rating: 1800, opponentRating: 1400, outcome: "loss" });
    const okLoss = ratingDelta({ rating: 1400, opponentRating: 1800, outcome: "loss" });
    expect(badLoss).toBeLessThan(okLoss);
    expect(badLoss).toBeLessThan(0);
  });

  it("moves a draw only slightly between equals", () => {
    expect(ratingDelta({ rating: 1500, opponentRating: 1500, outcome: "draw" })).toBe(0);
  });

  it("gains for a draw against a stronger player", () => {
    expect(ratingDelta({ rating: 1400, opponentRating: 1800, outcome: "draw" })).toBeGreaterThan(0);
  });

  it("is roughly zero-sum for equal K-factors", () => {
    const w = ratingDelta({ rating: 1500, opponentRating: 1520, outcome: "win", gamesPlayed: 50 });
    const l = ratingDelta({ rating: 1520, opponentRating: 1500, outcome: "loss", gamesPlayed: 50 });
    expect(Math.abs(w + l)).toBeLessThanOrEqual(1); // rounding only
  });

  it("scales with the K-factor", () => {
    const provisional = ratingDelta({
      rating: 1500,
      opponentRating: 1500,
      outcome: "win",
      gamesPlayed: 0,
    });
    const established = ratingDelta({
      rating: 1500,
      opponentRating: 1500,
      outcome: "win",
      gamesPlayed: 100,
    });
    expect(provisional).toBeGreaterThan(established);
  });
});

describe("ratingStakes", () => {
  it("orders win > draw > loss", () => {
    const s = ratingStakes({ rating: 1500, opponentRating: 1500 });
    expect(s.win).toBeGreaterThan(s.draw);
    expect(s.draw).toBeGreaterThan(s.loss);
  });
});

describe("bands", () => {
  it("covers the whole range without gaps", () => {
    for (let i = 1; i < ELO_BANDS.length; i++) {
      expect(ELO_BANDS[i].min).toBe(ELO_BANDS[i - 1].max);
    }
    expect(ELO_BANDS[0].min).toBe(0);
    expect(ELO_BANDS[ELO_BANDS.length - 1].max).toBeNull();
  });

  it("labels the starting rating and the top", () => {
    expect(bandOf(BASE_RATING).name).toBe("Novice");
    expect(bandOf(9999).name).toBe("Elite");
    expect(bandOf(1500).name).toBe("Advanced");
  });
});

describe("winRate", () => {
  it("counts draws as half a win", () => {
    expect(winRate(5, 5, 0)).toBe(50);
    expect(winRate(0, 0, 10)).toBe(50);
    expect(winRate(10, 0, 0)).toBe(100);
  });

  it("returns null with no games", () => {
    expect(winRate(0, 0, 0)).toBeNull();
  });
});
