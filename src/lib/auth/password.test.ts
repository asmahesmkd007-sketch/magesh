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

describe("usernameSchema", () => {
  it("accepts valid handles", () => {
    for (const name of ["abc", "grand_master", "Player99", "a".repeat(20)]) {
      expect(usernameSchema.safeParse(name).success).toBe(true);
      expect(USERNAME_REGEX.test(name)).toBe(true);
    }
  });

  it("rejects invalid handles", () => {
    for (const name of ["ab", "a".repeat(21), "has space", "dash-not-ok", "emoji😀", ""]) {
      expect(usernameSchema.safeParse(name).success).toBe(false);
      expect(USERNAME_REGEX.test(name)).toBe(false);
    }
  });

  it("trims surrounding whitespace", () => {
    const parsed = usernameSchema.safeParse("  player  ");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("player");
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
