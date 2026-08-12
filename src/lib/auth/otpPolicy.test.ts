import { describe, expect, it } from "vitest";
import {
  afterFailedAttempt,
  classifyOtp,
  classifyResetAuth,
  cooldownLeftMs,
  isWellFormedOtp,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  sentAtFromCooldown,
  type OtpRow,
} from "./otpPolicy";

const NOW = 1_800_000_000_000;

const row = (over: Partial<OtpRow> = {}): OtpRow => ({
  expiresAt: NOW + OTP_TTL_MS,
  attempts: 0,
  maxAttempts: OTP_MAX_ATTEMPTS,
  consumedAt: null,
  ...over,
});

describe("classifyOtp", () => {
  it("1. a live code is eligible for comparison", () => {
    expect(classifyOtp(row(), NOW)).toBe("check");
  });

  it("2. no row at all reads as no_otp", () => {
    expect(classifyOtp(null, NOW)).toBe("no_otp");
  });

  it("3. an expired code is rejected", () => {
    expect(classifyOtp(row({ expiresAt: NOW - 1 }), NOW)).toBe("otp_expired");
  });

  it("3b. expiry is exclusive at the boundary", () => {
    expect(classifyOtp(row({ expiresAt: NOW }), NOW)).toBe("otp_expired");
    expect(classifyOtp(row({ expiresAt: NOW + 1 }), NOW)).toBe("check");
  });

  it("4. a consumed code is rejected", () => {
    expect(classifyOtp(row({ consumedAt: NOW - 1000 }), NOW)).toBe("otp_consumed");
  });

  it("5. replay: consumption outranks expiry, so a spent code never reads as merely expired", () => {
    const spentAndStale = row({ consumedAt: NOW - 1000, expiresAt: NOW - 500 });
    expect(classifyOtp(spentAndStale, NOW)).toBe("otp_consumed");
  });

  it("6. exhausted attempts are rejected even while the code is still fresh", () => {
    expect(classifyOtp(row({ attempts: OTP_MAX_ATTEMPTS }), NOW)).toBe("too_many_attempts");
    expect(classifyOtp(row({ attempts: OTP_MAX_ATTEMPTS - 1 }), NOW)).toBe("check");
  });

  it("6b. a consumed row outranks an exhausted one", () => {
    expect(classifyOtp(row({ attempts: 99, consumedAt: NOW }), NOW)).toBe("otp_consumed");
  });

  it("never returns check for anything disqualified", () => {
    const bad: OtpRow[] = [
      row({ consumedAt: NOW }),
      row({ expiresAt: NOW - 1 }),
      row({ attempts: OTP_MAX_ATTEMPTS }),
    ];
    for (const r of bad) expect(classifyOtp(r, NOW)).not.toBe("check");
  });
});

describe("afterFailedAttempt", () => {
  it("counts up and only exhausts on the last allowed guess", () => {
    expect(afterFailedAttempt({ attempts: 0, maxAttempts: 5 })).toEqual({
      attempts: 1,
      exhausted: false,
    });
    expect(afterFailedAttempt({ attempts: 3, maxAttempts: 5 })).toEqual({
      attempts: 4,
      exhausted: false,
    });
    expect(afterFailedAttempt({ attempts: 4, maxAttempts: 5 })).toEqual({
      attempts: 5,
      exhausted: true,
    });
  });

  it("5 wrong guesses kill the code", () => {
    let attempts = 0;
    let exhausted = false;
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      ({ attempts, exhausted } = afterFailedAttempt({ attempts, maxAttempts: OTP_MAX_ATTEMPTS }));
    }
    expect(attempts).toBe(OTP_MAX_ATTEMPTS);
    expect(exhausted).toBe(true);
    expect(classifyOtp(row({ attempts }), NOW)).toBe("too_many_attempts");
  });
});

describe("classifyResetAuth", () => {
  it("16. a live grant is valid", () => {
    expect(classifyResetAuth({ authExpiresAt: NOW + 1000, consumedAt: NOW }, NOW)).toBe("valid");
  });

  it("16b. a spent grant (hash cleared) cannot be reused", () => {
    // Spending nulls auth_expires_at, so a replay is a lookup miss.
    expect(classifyResetAuth({ authExpiresAt: null, consumedAt: NOW }, NOW)).toBe("auth_invalid");
    expect(classifyResetAuth(null, NOW)).toBe("auth_invalid");
  });

  it("16c. an expired grant is refused", () => {
    expect(classifyResetAuth({ authExpiresAt: NOW - 1, consumedAt: NOW }, NOW)).toBe(
      "auth_expired",
    );
  });

  it("a consumed OTP is exactly what a valid grant looks like", () => {
    // The OTP must be consumed for a grant to exist at all — this asserts
    // the two lifecycles are not accidentally sharing a rule.
    expect(classifyResetAuth({ authExpiresAt: NOW + 1000, consumedAt: NOW - 5000 }, NOW)).toBe(
      "valid",
    );
  });
});

describe("cooldownLeftMs", () => {
  it("7. a recent send leaves time on the clock", () => {
    expect(cooldownLeftMs(NOW - 20_000, NOW)).toBe(RESEND_COOLDOWN_MS - 20_000);
  });

  it("8. no recorded send means no cooldown — a failed delivery never starts one", () => {
    expect(cooldownLeftMs(null, NOW)).toBe(0);
    expect(cooldownLeftMs(undefined, NOW)).toBe(0);
  });

  it("9. a send starts the full window", () => {
    expect(cooldownLeftMs(NOW, NOW)).toBe(RESEND_COOLDOWN_MS);
  });

  it("expires exactly on the boundary and never goes negative", () => {
    expect(cooldownLeftMs(NOW - RESEND_COOLDOWN_MS, NOW)).toBe(0);
    expect(cooldownLeftMs(NOW - 10 * RESEND_COOLDOWN_MS, NOW)).toBe(0);
  });

  it("accepts ISO strings, as read back from the database", () => {
    const iso = new Date(NOW - 30_000).toISOString();
    expect(cooldownLeftMs(iso, NOW)).toBe(RESEND_COOLDOWN_MS - 30_000);
  });

  it("10. cooldown is a pure function of one address's own last send", () => {
    // Two addresses, two independent last_sent_at values.
    const aLeft = cooldownLeftMs(NOW - 5_000, NOW);
    const bLeft = cooldownLeftMs(null, NOW);
    expect(aLeft).toBeGreaterThan(0);
    expect(bLeft).toBe(0);
  });
});

describe("sentAtFromCooldown", () => {
  it("places the send exactly as far back as the cooldown implies", () => {
    // 37s left on a 60s window means it went out 23s ago.
    expect(sentAtFromCooldown(37, NOW)).toBe(NOW - 23_000);
  });

  it("a full window left means it just went out", () => {
    expect(sentAtFromCooldown(RESEND_COOLDOWN_MS / 1000, NOW)).toBe(NOW);
  });

  it("positions the expiry countdown, not just the resend one", () => {
    // Arriving on a cooldown reply with 10s left: the code went out 50s
    // ago, so it has 4m10s of its 5-minute life remaining — not 5m.
    const sentAt = sentAtFromCooldown(10, NOW);
    expect(sentAt + OTP_TTL_MS - NOW).toBe(OTP_TTL_MS - 50_000);
  });

  it("never places the send in the future, however odd the input", () => {
    // A larger-than-window value would otherwise inflate the code's life.
    expect(sentAtFromCooldown(9999, NOW)).toBe(NOW);
    expect(sentAtFromCooldown(-5, NOW)).toBe(NOW - RESEND_COOLDOWN_MS);
  });

  it("agrees with cooldownLeftMs — the two are inverses", () => {
    for (const secs of [1, 15, 37, 59, 60]) {
      const sentAt = sentAtFromCooldown(secs, NOW);
      expect(Math.round(cooldownLeftMs(sentAt, NOW) / 1000)).toBe(secs);
    }
  });
});

describe("isWellFormedOtp", () => {
  it("18. accepts exactly six digits and nothing else", () => {
    expect(isWellFormedOtp("012345")).toBe(true);
    expect(isWellFormedOtp("999999")).toBe(true);
  });

  it("18b. rejects wrong length, letters, symbols and whitespace", () => {
    for (const bad of ["12345", "1234567", "12345a", "12 345", "", "abcdef", "-12345", "12345 "]) {
      expect(isWellFormedOtp(bad)).toBe(false);
    }
  });

  it("18c. rejects non-ASCII digit lookalikes", () => {
    expect(isWellFormedOtp("١٢٣٤٥٦")).toBe(false);
  });
});
