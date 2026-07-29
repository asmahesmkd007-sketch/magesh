import { describe, expect, it } from "vitest";

import { classifyVerification, type PendingState } from "./tokenLifecycle";

// These tests pin the verification token state machine. The first cut of
// this flow cleared the token digest on use, which made a page refresh
// report "invalid" and left "already verified" unreachable — see
// schema.sql SECTION 103.4.

const base: PendingState = {
  found: true,
  status: "pending_verification",
  tokenConsumedAt: null,
  tokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe("classifyVerification", () => {
  it("verifies a fresh, unexpired link", () => {
    expect(classifyVerification(base)).toBe("verify");
  });

  it("reports an unknown token as invalid", () => {
    expect(classifyVerification({ ...base, found: false })).toBe("invalid");
  });

  it("reports an expired link as expired", () => {
    expect(
      classifyVerification({ ...base, tokenExpiresAt: new Date(Date.now() - 1000).toISOString() }),
    ).toBe("expired");
    expect(classifyVerification({ ...base, tokenExpiresAt: null })).toBe("expired");
  });

  it("refuses to issue a second grant for a consumed link", () => {
    expect(
      classifyVerification({
        ...base,
        status: "email_verified",
        tokenConsumedAt: new Date().toISOString(),
      }),
    ).toBe("already_verified");
  });

  it("reports a completed registration as already verified", () => {
    expect(classifyVerification({ ...base, status: "completed" })).toBe("already_verified");
  });

  it("prefers 'already verified' over 'expired' for a used link", () => {
    // A consumed link whose window has also lapsed is still best
    // described as already verified — the user did succeed.
    expect(
      classifyVerification({
        ...base,
        status: "email_verified",
        tokenConsumedAt: new Date().toISOString(),
        tokenExpiresAt: null,
      }),
    ).toBe("already_verified");
  });

  it("never verifies twice for the same token", () => {
    const first = classifyVerification(base);
    expect(first).toBe("verify");
    // Simulate the server stamping consumption, then a repeat request.
    const after: PendingState = {
      ...base,
      status: "email_verified",
      tokenConsumedAt: new Date().toISOString(),
      tokenExpiresAt: null,
    };
    expect(classifyVerification(after)).not.toBe("verify");
  });
});
