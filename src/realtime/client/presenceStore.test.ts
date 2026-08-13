import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The store talks to the server through ./socket. Stub the transport so the
// tests observe exactly what would go on the wire.
const requestMock = vi.fn();
const socketHandlers = new Map<string, (payload: unknown) => void>();
const fakeSocket = {
  on: (event: string, cb: (payload: unknown) => void) => {
    socketHandlers.set(event, cb);
  },
};

vi.mock("./socket", () => ({
  ensureConnected: () => fakeSocket,
  getSocket: () => fakeSocket,
  request: (...args: unknown[]) => requestMock(...args),
}));

import {
  __flushPresenceQueueForTests,
  __resetPresenceStoreForTests,
  getPresenceSnapshot,
  queuePresenceFetch,
  setLocalPresence,
  subscribePresence,
} from "./presenceStore";

/** What the server would answer for a set of ids. */
const respondWith = (ids: string[]) => ({
  presences: ids.map((userId) => ({ userId, status: "online" as const, updatedAt: Date.now() })),
});

/** The ids sent in a given request call. */
const idsOf = (call: unknown[]) => (call[1] as { userIds: string[] }).userIds;

beforeEach(() => {
  requestMock.mockReset();
  requestMock.mockImplementation((_event: string, payload: { userIds: string[] }) =>
    Promise.resolve(respondWith(payload.userIds)),
  );
  __resetPresenceStoreForTests();
});

afterEach(() => {
  __resetPresenceStoreForTests();
});

describe("presence micro-batching", () => {
  it("1. a single id produces one request for that id", async () => {
    await queuePresenceFetch("u1");
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(idsOf(requestMock.mock.calls[0])).toEqual(["u1"]);
    expect(getPresenceSnapshot("u1")?.status).toBe("online");
  });

  it("2. many ids in the same tick collapse into ONE request", async () => {
    // What a list of avatars does: each mounts and asks for its own id.
    const ids = ["a", "b", "c", "d", "e"];
    const pending = ids.map((id) => queuePresenceFetch(id));
    await Promise.all(pending);

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(idsOf(requestMock.mock.calls[0]).sort()).toEqual(ids);
    for (const id of ids) expect(getPresenceSnapshot(id)?.status).toBe("online");
  });

  it("3. duplicate ids in the same tick are deduplicated", async () => {
    await Promise.all([
      queuePresenceFetch("dup"),
      queuePresenceFetch("dup"),
      queuePresenceFetch("dup"),
      queuePresenceFetch("other"),
    ]);

    expect(requestMock).toHaveBeenCalledTimes(1);
    const sent = idsOf(requestMock.mock.calls[0]);
    expect(sent.sort()).toEqual(["dup", "other"]);
    expect(sent.filter((i) => i === "dup")).toHaveLength(1);
  });

  it("4. an already-cached id is not refetched", async () => {
    setLocalPresence("cached", "online");
    await queuePresenceFetch("cached");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("4b. a cached id does not suppress its uncached neighbours", async () => {
    setLocalPresence("cached", "offline");
    await Promise.all([queuePresenceFetch("cached"), queuePresenceFetch("fresh")]);

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(idsOf(requestMock.mock.calls[0])).toEqual(["fresh"]);
  });

  it("5. an empty or nullish id requests nothing", async () => {
    await queuePresenceFetch(undefined);
    await queuePresenceFetch(null);
    await queuePresenceFetch("");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("6. an id already in flight is not requested twice", async () => {
    let release: (v: unknown) => void = () => {};
    requestMock.mockImplementationOnce(
      () =>
        new Promise((res) => {
          release = res;
        }),
    );

    const first = queuePresenceFetch("slow");
    await Promise.resolve(); // let the microtask put it on the wire
    await queuePresenceFetch("slow"); // second mount while in flight

    expect(requestMock).toHaveBeenCalledTimes(1);
    release(respondWith(["slow"]));
    await first;
  });

  it("7. a failed request releases the id so a later mount can retry", async () => {
    requestMock.mockImplementationOnce(() => Promise.reject(new Error("offline")));
    await queuePresenceFetch("flaky");
    expect(requestMock).toHaveBeenCalledTimes(1);

    // Nothing cached, nothing stuck in flight — the retry goes out.
    await queuePresenceFetch("flaky");
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it("8. later ticks start a new batch", async () => {
    await queuePresenceFetch("t1");
    await queuePresenceFetch("t2");
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(idsOf(requestMock.mock.calls[0])).toEqual(["t1"]);
    expect(idsOf(requestMock.mock.calls[1])).toEqual(["t2"]);
  });

  it("9. flushing an empty queue is a no-op", async () => {
    await __flushPresenceQueueForTests();
    expect(requestMock).not.toHaveBeenCalled();
  });
});

describe("presence store subscription cleanup", () => {
  it("10. unsubscribing removes the listener and stops notifications", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePresence(listener);

    setLocalPresence("u1", "online");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setLocalPresence("u2", "online");
    expect(listener).toHaveBeenCalledTimes(1); // no further calls after cleanup
  });

  it("11. repeated unsubscribes are safe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePresence(listener);
    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();
  });

  it("12. realtime presence:update events still merge and notify", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePresence(listener);
    listener.mockClear();

    const handler = socketHandlers.get("presence:update");
    expect(handler).toBeTypeOf("function");
    handler?.({ presences: [{ userId: "live", status: "online", updatedAt: Date.now() }] });

    expect(getPresenceSnapshot("live")?.status).toBe("online");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("13. a stale update (older timestamp) does not overwrite newer state", () => {
    setLocalPresence("u1", "online", 2000);
    const handler = socketHandlers.get("presence:update");
    handler?.({ presences: [{ userId: "u1", status: "offline", updatedAt: 1000 }] });

    expect(getPresenceSnapshot("u1")?.status).toBe("online");
  });
});
