import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clearCooldown, cooldownRemainingMs, markCooldown, rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows up to the limit then blocks", () => {
    const key = `t:${Math.random()}`;
    expect(rateLimit({ key, limit: 3, windowMs: 1000 })).toBe(true);
    expect(rateLimit({ key, limit: 3, windowMs: 1000 })).toBe(true);
    expect(rateLimit({ key, limit: 3, windowMs: 1000 })).toBe(true);
    expect(rateLimit({ key, limit: 3, windowMs: 1000 })).toBe(false);
  });

  it("resets after the window elapses", () => {
    const key = `t:${Math.random()}`;
    expect(rateLimit({ key, limit: 1, windowMs: 1000 })).toBe(true);
    expect(rateLimit({ key, limit: 1, windowMs: 1000 })).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rateLimit({ key, limit: 1, windowMs: 1000 })).toBe(true);
  });

  it("tracks keys independently", () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    expect(rateLimit({ key: a, limit: 1, windowMs: 1000 })).toBe(true);
    expect(rateLimit({ key: a, limit: 1, windowMs: 1000 })).toBe(false);
    expect(rateLimit({ key: b, limit: 1, windowMs: 1000 })).toBe(true);
  });
});

describe("cooldown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const key = () => `cd:${Math.random()}`;

  it("is free until something is recorded", () => {
    expect(cooldownRemainingMs(key(), 60_000)).toBe(0);
  });

  it("checking never starts one — the regression this API exists to prevent", () => {
    // A request that fails must leave the window untouched, so the retry is
    // answered with the real error rather than "please wait".
    const k = key();
    for (let i = 0; i < 5; i++) expect(cooldownRemainingMs(k, 60_000)).toBe(0);
  });

  it("reports the remaining time accurately after being recorded", () => {
    const k = key();
    markCooldown(k);
    expect(cooldownRemainingMs(k, 60_000)).toBe(60_000);
    vi.advanceTimersByTime(20_000);
    expect(cooldownRemainingMs(k, 60_000)).toBe(40_000);
  });

  it("expires on its own once the window elapses", () => {
    const k = key();
    markCooldown(k);
    vi.advanceTimersByTime(59_999);
    expect(cooldownRemainingMs(k, 60_000)).toBe(1);
    vi.advanceTimersByTime(1);
    expect(cooldownRemainingMs(k, 60_000)).toBe(0);
  });

  it("never reports a negative remainder", () => {
    const k = key();
    markCooldown(k);
    vi.advanceTimersByTime(10 * 60_000);
    expect(cooldownRemainingMs(k, 60_000)).toBe(0);
  });

  it("keys do not share a window", () => {
    const a = key();
    const b = key();
    markCooldown(a);
    expect(cooldownRemainingMs(a, 60_000)).toBeGreaterThan(0);
    expect(cooldownRemainingMs(b, 60_000)).toBe(0);
  });

  it("re-recording restarts the window", () => {
    const k = key();
    markCooldown(k);
    vi.advanceTimersByTime(50_000);
    markCooldown(k);
    expect(cooldownRemainingMs(k, 60_000)).toBe(60_000);
  });

  it("can be cleared explicitly", () => {
    const k = key();
    markCooldown(k);
    clearCooldown(k);
    expect(cooldownRemainingMs(k, 60_000)).toBe(0);
  });

  it("models the handler: failures stay retryable, a send starts the wait", () => {
    const k = `pwreset-cooldown:user@example.com`;
    clearCooldown(k);

    // Two failed attempts (delivery rejected) — nothing recorded.
    expect(cooldownRemainingMs(k, 60_000)).toBe(0);
    expect(cooldownRemainingMs(k, 60_000)).toBe(0);

    // Third attempt succeeds, so the send is recorded.
    expect(cooldownRemainingMs(k, 60_000)).toBe(0);
    markCooldown(k);

    // Now, and only now, a follow-up is throttled.
    expect(Math.ceil(cooldownRemainingMs(k, 60_000) / 1000)).toBe(60);
    vi.advanceTimersByTime(60_000);
    expect(cooldownRemainingMs(k, 60_000)).toBe(0);
  });
});
