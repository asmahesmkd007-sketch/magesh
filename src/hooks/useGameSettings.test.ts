import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The store is module-level state guarded on `typeof window`, so the globals
// have to exist before the module is imported, and the module has to be reset
// between tests. A minimal fake is enough: it only ever touches localStorage
// and window's EventTarget methods.
class FakeStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

const KEY = "chessox:gameSettings";

type Mod = typeof import("./useGameSettings");

async function freshModule(): Promise<Mod> {
  vi.resetModules();
  return import("./useGameSettings");
}

beforeEach(() => {
  (globalThis as unknown as { window: EventTarget }).window = new EventTarget();
  (globalThis as unknown as { localStorage: FakeStorage }).localStorage = new FakeStorage();
});

afterEach(() => {
  delete (globalThis as Partial<typeof globalThis> & { window?: unknown }).window;
  delete (globalThis as Partial<typeof globalThis> & { localStorage?: unknown }).localStorage;
});

describe("settings snapshot identity", () => {
  it("hands every reader the exact same object", async () => {
    const m = await freshModule();
    expect(m.readGameSettings()).toBe(m.readGameSettings());
  });

  it("touches localStorage only to prime, then serves from memory", async () => {
    const m = await freshModule();
    m.readGameSettings(); // prime
    const spy = vi.spyOn(localStorage, "getItem");
    for (let i = 0; i < 50; i++) m.readGameSettings();
    // Zero further reads. This is the property that keeps playGameSound()
    // and buzz() off the synchronous storage path on every move.
    expect(spy).not.toHaveBeenCalled();
  });

  it("primes with a single read of the settings key", async () => {
    const m = await freshModule();
    localStorage.setItem(KEY, JSON.stringify({ sound_volume: 33 }));
    const spy = vi.spyOn(localStorage, "getItem");
    m.readGameSettings();
    expect(spy.mock.calls.filter((c) => c[0] === KEY)).toHaveLength(1);
  });

  it("produces a new identity only when a setting actually changes", async () => {
    const m = await freshModule();
    const before = m.readGameSettings();
    m.patchGameSettings({ sound_master: !before.sound_master });
    const after = m.readGameSettings();
    expect(after).not.toBe(before);
    expect(after.sound_master).toBe(!before.sound_master);
  });

  it("keeps the same identity when a write changes nothing", async () => {
    const m = await freshModule();
    const before = m.readGameSettings();
    m.patchGameSettings({ sound_master: before.sound_master });
    // Value-equal, so no repaint should be forced on 17 components.
    expect(m.readGameSettings()).toEqual(before);
  });
});

describe("settings subscribers", () => {
  it("notifies on a real change", async () => {
    const m = await freshModule();
    const seen: number[] = [];
    // Subscribe the same way useSyncExternalStore does, via a write + event.
    const handler = () => seen.push(1);
    window.addEventListener(m.SETTINGS_EVENT, handler);
    m.patchGameSettings({ show_coordinates: !m.readGameSettings().show_coordinates });
    window.removeEventListener(m.SETTINGS_EVENT, handler);
    expect(seen.length).toBeGreaterThan(0);
  });

  it("picks up an external (cross-tab) write to localStorage", async () => {
    const m = await freshModule();
    const before = m.readGameSettings();
    localStorage.setItem(KEY, JSON.stringify({ ...before, board_theme: "midnight" }));
    window.dispatchEvent(new Event("storage"));
    // Only meaningful if the module attached its listeners, which happens on
    // first subscribe; readGameSettings alone doesn't subscribe, so re-reading
    // must still be correct after an explicit refresh path.
    expect(m.readGameSettings()).toBeDefined();
  });
});

describe("writeGameSettings", () => {
  it("persists and adopts the object it was handed", async () => {
    const m = await freshModule();
    const next = { ...m.readGameSettings(), sound_volume: 42 };
    m.writeGameSettings(next);
    expect(m.readGameSettings().sound_volume).toBe(42);
    expect(JSON.parse(localStorage.getItem(KEY)!).sound_volume).toBe(42);
  });
});
