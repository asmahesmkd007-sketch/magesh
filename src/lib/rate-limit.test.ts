import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit } from "./rate-limit";

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
