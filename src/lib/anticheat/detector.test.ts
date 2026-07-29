// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ANTICHEAT_CONFIG } from "./config";
import { AntiCheatDetector } from "./detector.client";
import type { ClientEventBatch } from "./types";

const CFG = ANTICHEAT_CONFIG.client;

function makeDetector() {
  const batches: ClientEventBatch[] = [];
  const transport = vi.fn(async (batch: ClientEventBatch) => {
    batches.push(batch);
  });
  const detector = new AntiCheatDetector(transport);
  return { detector, batches, transport };
}

function typesIn(batches: ClientEventBatch[]): string[] {
  return batches.flatMap((b) => b.events.map((e) => e.type));
}

function countOf(batches: ClientEventBatch[], type: string): number {
  return batches
    .flatMap((b) => b.events)
    .filter((e) => e.type === type)
    .reduce((a, e) => a + e.count, 0);
}

describe("AntiCheatDetector", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("records tab switches and flushes them in a batch", async () => {
    const { detector, batches } = makeDetector();
    detector.start();
    detector.setGame("11111111-1111-1111-1111-111111111111", true);

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await detector.flush();
    detector.stop();

    expect(typesIn(batches)).toContain("tab_switch");
    expect(batches[0].gameId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("aggregates repeated events into a single entry with a count", async () => {
    const { detector, batches } = makeDetector();
    detector.start();
    for (let i = 0; i < 5; i++) window.dispatchEvent(new Event("blur"));
    await detector.flush();
    detector.stop();

    expect(countOf(batches, "focus_loss")).toBe(5);
    expect(batches[0].events.filter((e) => e.type === "focus_loss")).toHaveLength(1);
  });

  it("flags excessive minimize/restore churn", async () => {
    const { detector, batches } = makeDetector();
    detector.start();
    for (let i = 0; i < CFG.visibilityChurnThreshold; i++) {
      document.dispatchEvent(new Event("visibilitychange"));
    }
    await detector.flush();
    detector.stop();

    expect(typesIn(batches)).toContain("excessive_visibility_toggle");
  });

  it("records devtools keyboard shortcuts", async () => {
    const { detector, batches } = makeDetector();
    detector.start();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F12" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "I", ctrlKey: true, shiftKey: true }));
    await detector.flush();
    detector.stop();

    expect(countOf(batches, "devtools_shortcut")).toBe(2);
  });

  it("records synthetic (untrusted) pointer input on the board", async () => {
    const { detector, batches } = makeDetector();
    detector.start();
    // Events constructed in script are isTrusted === false — exactly what
    // a click-automation library produces.
    window.dispatchEvent(new PointerEvent("pointerdown", { clientX: 10, clientY: 20 }));
    await detector.flush();
    detector.stop();

    expect(typesIn(batches)).toContain("untrusted_input");
  });

  it("records an instant reaction, and idleness when the player never touched the board", async () => {
    const nowSpy = vi.spyOn(performance, "now");
    nowSpy.mockReturnValue(0);

    const { detector, batches } = makeDetector();
    detector.start(); // baselines idle tracking at t=0
    detector.setGame("22222222-2222-2222-2222-222222222222", true);

    // The opponent moves a full minute in; the reply lands instantly and
    // no pointer/keyboard activity happened in between.
    nowSpy.mockReturnValue(60_000);
    detector.noteOpponentMove();
    nowSpy.mockReturnValue(60_000 + CFG.instantReactionMs / 2);
    detector.noteOwnMoveCommitted();

    await detector.flush();
    detector.stop();

    const types = typesIn(batches);
    expect(types).toContain("instant_reaction");
    expect(types).toContain("suspicious_idle");
  });

  it("does not call an instant reply idle when the player was actively interacting", async () => {
    const nowSpy = vi.spyOn(performance, "now");
    nowSpy.mockReturnValue(0);

    const { detector, batches } = makeDetector();
    detector.start();
    detector.setGame("44444444-4444-4444-4444-444444444444", true);

    nowSpy.mockReturnValue(60_000);
    detector.noteOpponentMove();
    // Real mouse movement over the board right before the reply.
    nowSpy.mockReturnValue(60_100);
    window.dispatchEvent(new Event("pointermove"));
    nowSpy.mockReturnValue(60_200);
    detector.noteOwnMoveCommitted();

    await detector.flush();
    detector.stop();

    const types = typesIn(batches);
    expect(types).toContain("instant_reaction");
    expect(types).not.toContain("suspicious_idle");
  });

  it("does not record an instant reaction for a normal-paced reply", async () => {
    const nowSpy = vi.spyOn(performance, "now");
    nowSpy.mockReturnValue(0);

    const { detector, batches } = makeDetector();
    detector.start();
    detector.setGame("33333333-3333-3333-3333-333333333333", true);

    nowSpy.mockReturnValue(1_000);
    detector.noteOpponentMove();
    nowSpy.mockReturnValue(5_000);
    detector.noteOwnMoveCommitted();

    await detector.flush();
    detector.stop();

    expect(typesIn(batches)).not.toContain("instant_reaction");
  });

  it("records connection drops and restores", async () => {
    const { detector, batches } = makeDetector();
    detector.start();
    detector.noteConnection("dropped");
    detector.noteConnection("restored");
    await detector.flush();
    detector.stop();

    const types = typesIn(batches);
    expect(types).toContain("connection_drop");
    expect(types).toContain("connection_restore");
  });

  it("persists events to localStorage when the transport fails, and retries next session", async () => {
    const failing = new AntiCheatDetector(async () => {
      throw new Error("offline");
    });
    failing.start();
    window.dispatchEvent(new Event("blur"));
    await failing.flush();
    failing.stop();

    expect(localStorage.getItem(CFG.pendingStorageKey)).toBeTruthy();

    // A fresh session picks the stashed events back up.
    const { detector, batches } = makeDetector();
    detector.start();
    await detector.flush();
    detector.stop();

    expect(typesIn(batches)).toContain("focus_loss");
    expect(localStorage.getItem(CFG.pendingStorageKey)).toBeNull();
  });

  it("ignores events before start() and after stop()", async () => {
    const { detector, batches, transport } = makeDetector();
    detector.record("tab_switch");
    detector.start();
    detector.stop();
    detector.record("tab_switch");
    await detector.flush();

    expect(transport).not.toHaveBeenCalled();
    expect(batches).toHaveLength(0);
  });

  it("stops observing after stop() so a background page costs nothing", async () => {
    const { detector, batches } = makeDetector();
    detector.start();
    detector.stop();
    for (let i = 0; i < 10; i++) window.dispatchEvent(new Event("blur"));
    await detector.flush();

    expect(countOf(batches, "focus_loss")).toBe(0);
  });

  it("caps a batch at the configured maximum", async () => {
    const { detector, batches } = makeDetector();
    detector.start();
    for (let i = 0; i < CFG.maxEventsPerBatch + 30; i++) {
      // Distinct game ids create distinct queue keys.
      detector.setGame(`0000000${i % 10}-0000-0000-0000-00000000000${i % 10}`, true);
      detector.record("tab_switch");
    }
    await detector.flush();
    detector.stop();

    for (const batch of batches) {
      expect(batch.events.length).toBeLessThanOrEqual(CFG.maxEventsPerBatch);
    }
  });
});
