import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_RULES,
  emailSchema,
  failedPasswordRules,
  passwordMeetsPolicy,
  passwordSchema,
  passwordStrength,
  usernameSchema,
  USERNAME_REGEX,
} from "./password";

const VALID = "Chess0x!Rook";

describe("passwordMeetsPolicy", () => {
  it("accepts a password satisfying every rule", () => {
    expect(passwordMeetsPolicy(VALID)).toBe(true);
    expect(failedPasswordRules(VALID)).toEqual([]);
  });

  it("rejects each rule violation individually", () => {
    const cases: [string, string][] = [
      ["Ch0x!Ro", "length"], // 7 chars
      ["chess0x!rook", "upper"],
      ["CHESS0X!ROOK", "lower"],
      ["ChessOx!Rook", "number"],
      ["Chess0xRook", "special"],
    ];
    for (const [password, expectedFailure] of cases) {
      expect(passwordMeetsPolicy(password)).toBe(false);
      expect(failedPasswordRules(password).map((r) => r.key)).toContain(expectedFailure);
    }
  });

  it("rejects passwords beyond what bcrypt hashes", () => {
    const tooLong = "A1!a".repeat(30); // 120 chars
    expect(tooLong.length).toBeGreaterThan(PASSWORD_MAX_LENGTH);
    expect(passwordMeetsPolicy(tooLong)).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(passwordMeetsPolicy("")).toBe(false);
    expect(failedPasswordRules("")).toHaveLength(PASSWORD_RULES.length);
  });
});

describe("passwordSchema (server-side)", () => {
  it("agrees with passwordMeetsPolicy", () => {
    const samples = [
      VALID,
      "short1!A",
      "nouppercase1!",
      "NOLOWERCASE1!",
      "NoNumber!!",
      "NoSpecial1",
    ];
    for (const sample of samples) {
      expect(passwordSchema.safeParse(sample).success).toBe(passwordMeetsPolicy(sample));
    }
  });

  it("reports an actionable message", () => {
    const result = passwordSchema.safeParse("chess0x!rook");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/uppercase/i);
    }
  });
});

describe("passwordStrength", () => {
  it("is empty for no input and never calls a failing password strong", () => {
    expect(passwordStrength("").score).toBe(0);
    for (const weak of ["a", "abc", "abcdefgh", "Abcdefgh"]) {
      expect(passwordStrength(weak).score).toBeLessThanOrEqual(2);
    }
  });

  it("rewards length once every rule is met", () => {
    const short = passwordStrength(VALID);
    const long = passwordStrength(`${VALID}Longer99!`);
    expect(long.score).toBeGreaterThanOrEqual(short.score);
    expect(long.score).toBe(4);
  });
});

// The handle rule is: exactly 11 characters, drawn from [a-zA-Z0-9_.],
// and containing at least one '_' or '.' (see isValidUsernameFormat).
// These tests previously asserted an earlier 3–20 character rule and had
// drifted out of date with the implementation.
describe("usernameSchema", () => {
  it("accepts 11-character handles containing a separator", () => {
    for (const name of ["chessfox_42", "grand.maste", "Player99_XY", "a_123456789"]) {
      expect(name).toHaveLength(11);
      expect(usernameSchema.safeParse(name).success).toBe(true);
      expect(USERNAME_REGEX.test(name)).toBe(true);
    }
  });

  it("rejects handles of the wrong length", () => {
    for (const name of ["ab", "chessfox_4", "chessfox_422", "a".repeat(21), ""]) {
      expect(usernameSchema.safeParse(name).success).toBe(false);
    }
  });

  it("rejects 11-character handles with no separator", () => {
    // Length and character class are fine, so the bare regex passes — the
    // separator requirement lives in the schema's refine step.
    expect(USERNAME_REGEX.test("abcdefghijk")).toBe(true);
    expect(usernameSchema.safeParse("abcdefghijk").success).toBe(false);
  });

  it("rejects disallowed characters", () => {
    for (const name of ["has space_", "dash-not-ok", "emoji😀_abcd"]) {
      expect(usernameSchema.safeParse(name).success).toBe(false);
      expect(USERNAME_REGEX.test(name)).toBe(false);
    }
  });

  it("trims surrounding whitespace before validating", () => {
    const parsed = usernameSchema.safeParse("  chessfox_42  ");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("chessfox_42");
  });
});

describe("emailSchema", () => {
  it("normalises to trimmed lowercase", () => {
    const parsed = emailSchema.safeParse("  Player@Example.COM ");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("player@example.com");
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["", "nope", "a@b", "@example.com", "x@.com"]) {
      expect(emailSchema.safeParse(bad).success).toBe(false);
    }
  });
});
