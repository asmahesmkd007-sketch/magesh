import { describe, expect, it } from "vitest";
import { type AccountFacts, classifyRecovery } from "./recoveryPolicy";

const facts = (over: Partial<AccountFacts> = {}): AccountFacts => ({
  exists: true,
  hasPassword: true,
  identities: ["email"],
  ...over,
});

describe("classifyRecovery", () => {
  it("sends a link for an ordinary email account", () => {
    expect(classifyRecovery(facts())).toBe("send_link");
  });

  it("stays silent for an address with no account", () => {
    expect(classifyRecovery(facts({ exists: false }))).toBe("silent");
  });

  it("does not leak an unknown address by treating it as a Google account", () => {
    // exists:false wins over every other signal.
    expect(
      classifyRecovery(facts({ exists: false, hasPassword: false, identities: ["google"] })),
    ).toBe("silent");
  });

  it("notifies instead of resetting when the account is Google-only", () => {
    expect(classifyRecovery(facts({ hasPassword: false, identities: ["google"] }))).toBe(
      "google_notice",
    );
  });

  it("sends a link when a Google-linked account also has a password", () => {
    // The password is real and resettable, so resetting it is not the same
    // as minting a new credential for a federated-only identity.
    expect(classifyRecovery(facts({ hasPassword: true, identities: ["email", "google"] }))).toBe(
      "send_link",
    );
  });

  it("sends a link for a passwordless account with no federated identity", () => {
    // Fails closed at redemption rather than silently doing nothing.
    expect(classifyRecovery(facts({ hasPassword: false, identities: [] }))).toBe("send_link");
  });

  it("never returns google_notice for an account that has a password", () => {
    for (const identities of [["google"], ["email", "google"], ["email"]]) {
      expect(classifyRecovery(facts({ hasPassword: true, identities }))).toBe("send_link");
    }
  });
});
