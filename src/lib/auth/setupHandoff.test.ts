import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SETUP_TOKEN_KEY, clearSetupHandoff, readSetupHandoff } from "./setupHandoff";

// The handoff runs in the browser; vitest's default environment is node,
// so stand up a minimal sessionStorage for these tests.
function installSessionStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal("sessionStorage", mock);
  return mock;
}

describe("setup handoff", () => {
  let storage: ReturnType<typeof installSessionStorage>;

  beforeEach(() => {
    storage = installSessionStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a complete handoff", () => {
    storage.setItem(
      SETUP_TOKEN_KEY,
      JSON.stringify({ setupToken: "tok", email: "a@b.com", username: "player" }),
    );
    expect(readSetupHandoff()).toEqual({
      setupToken: "tok",
      email: "a@b.com",
      username: "player",
    });
  });

  it("returns null when nothing is stored", () => {
    expect(readSetupHandoff()).toBeNull();
  });

  it("returns null for malformed or partial payloads rather than throwing", () => {
    for (const bad of [
      "not json",
      "{}",
      JSON.stringify({ setupToken: "tok" }),
      JSON.stringify({ setupToken: 1, email: "a@b.com", username: "p" }),
      JSON.stringify(null),
    ]) {
      storage.setItem(SETUP_TOKEN_KEY, bad);
      expect(readSetupHandoff()).toBeNull();
    }
  });

  it("clears the stored grant", () => {
    storage.setItem(
      SETUP_TOKEN_KEY,
      JSON.stringify({ setupToken: "tok", email: "a@b.com", username: "player" }),
    );
    clearSetupHandoff();
    expect(readSetupHandoff()).toBeNull();
    expect(storage.getItem(SETUP_TOKEN_KEY)).toBeNull();
  });

  it("degrades quietly when sessionStorage is unavailable", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("sessionStorage", undefined);
    expect(readSetupHandoff()).toBeNull();
    expect(() => clearSetupHandoff()).not.toThrow();
  });
});
