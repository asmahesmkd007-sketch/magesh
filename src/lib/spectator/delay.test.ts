import { describe, expect, it } from "vitest";

import {
  DEFAULT_DELAY_SECONDS,
  DELAY_BANDS,
  bandFor,
  behindLabel,
  delayExplanation,
  estimateDelaySeconds,
  formatDelay,
} from "./delay";

describe("delay bands", () => {
  it("selects the band the spec prescribes", () => {
    expect(bandFor({ isRated: false })).toBe("casual");
    expect(bandFor({ isRated: true })).toBe("ranked");
    expect(bandFor({ isRated: true, isTournamentFinal: true })).toBe("final");
  });

  it("treats a final as a final even when the game is unrated", () => {
    expect(bandFor({ isRated: false, isTournamentFinal: true })).toBe("final");
  });

  // The shipped defaults must sit inside the ranges the database CHECKs
  // enforce, or spectator_config would reject the value this file claims.
  it("keeps every default inside its band", () => {
    for (const band of ["casual", "ranked", "final"] as const) {
      const { min, max } = DELAY_BANDS[band];
      expect(DEFAULT_DELAY_SECONDS[band]).toBeGreaterThanOrEqual(min);
      expect(DEFAULT_DELAY_SECONDS[band]).toBeLessThanOrEqual(max);
    }
  });

  it("never lets a ranked game be estimated as real time", () => {
    expect(estimateDelaySeconds({ isRated: true })).toBeGreaterThanOrEqual(20);
    expect(estimateDelaySeconds({ isRated: true, isTournamentFinal: true })).toBeGreaterThanOrEqual(
      30,
    );
  });
});

describe("formatDelay", () => {
  it("renders seconds under a minute", () => {
    expect(formatDelay(3)).toBe("3s");
    expect(formatDelay(25)).toBe("25s");
    expect(formatDelay(59)).toBe("59s");
  });

  it("renders minutes at or past 60s", () => {
    expect(formatDelay(60)).toBe("1m");
    expect(formatDelay(65)).toBe("1:05");
  });

  it("calls a zero delay live", () => {
    expect(formatDelay(0)).toBe("live");
    expect(formatDelay(-1)).toBe("live");
  });
});

describe("delayExplanation", () => {
  it("tells players their own board is not delayed", () => {
    expect(delayExplanation({ delay_seconds: 0, is_player: true })).toMatch(/playing this game/i);
  });

  it("names the delay for a spectator", () => {
    expect(delayExplanation({ delay_seconds: 25, is_player: false })).toMatch(/delayed by 25s/i);
  });

  it("explains an undelayed feed as a finished game", () => {
    expect(delayExplanation({ delay_seconds: 0, is_player: false })).toMatch(/finished/i);
  });
});

describe("behindLabel", () => {
  it("is silent when the viewer is caught up", () => {
    expect(behindLabel(0)).toBeNull();
    expect(behindLabel(-2)).toBeNull();
  });

  it("singularises one move", () => {
    expect(behindLabel(1)).toBe("1 move behind");
    expect(behindLabel(4)).toBe("4 moves behind");
  });
});
