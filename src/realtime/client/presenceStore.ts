import type { PresenceState, UserPresence } from "../protocol";
import { ensureConnected, getSocket, request } from "./socket";

// Module-level global presence map: userId -> UserPresence
const presenceMap = new Map<string, UserPresence>();
const listeners = new Set<() => void>();

let socketSubscribed = false;

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Ensures socket listeners for real-time presence events are registered.
 */
export function initPresenceSocket(): void {
  if (socketSubscribed) return;
  const socket = ensureConnected();

  socket.on("presence:update", (payload) => {
    if (!payload?.presences) return;
    let changed = false;
    for (const item of payload.presences) {
      const existing = presenceMap.get(item.userId);
      // Monotonic sequence protection: ignore stale events with older timestamp
      if (!existing || item.updatedAt >= existing.updatedAt) {
        presenceMap.set(item.userId, item);
        changed = true;
      }
    }
    if (changed) notifyListeners();
  });

  socket.on("presence:snapshot", (payload) => {
    if (!payload?.presences) return;
    let changed = false;
    for (const item of payload.presences) {
      const existing = presenceMap.get(item.userId);
      if (!existing || item.updatedAt >= existing.updatedAt) {
        presenceMap.set(item.userId, item);
        changed = true;
      }
    }
    if (changed) notifyListeners();
  });

  socket.on("connect", () => {
    // On connect / reconnect, request current presence snapshot for all active store keys
    const activeUserIds = Array.from(presenceMap.keys());
    if (activeUserIds.length > 0) {
      void request<"presence:subscribe", { presences: UserPresence[] }>("presence:subscribe", {
        userIds: activeUserIds,
      })
        .then((res) => {
          if (res?.presences) {
            for (const item of res.presences) {
              const existing = presenceMap.get(item.userId);
              if (!existing || item.updatedAt >= existing.updatedAt) {
                presenceMap.set(item.userId, item);
              }
            }
            notifyListeners();
          }
        })
        .catch(() => {});
    }
  });

  socketSubscribed = true;
}

/**
 * Subscribe a callback listener to the presence store.
 */
export function subscribePresence(listener: () => void): () => void {
  initPresenceSocket();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Get cached presence object for a user ID.
 */
export function getPresenceSnapshot(userId?: string | null): UserPresence | undefined {
  if (!userId) return undefined;
  return presenceMap.get(userId);
}

/**
 * Batch request current presence for specific user IDs from the server.
 */
export async function fetchUserPresences(userIds: string[]): Promise<UserPresence[]> {
  if (!userIds || userIds.length === 0) return [];
  initPresenceSocket();
  try {
    const res = await request<"presence:subscribe", { presences: UserPresence[] }>(
      "presence:subscribe",
      { userIds },
    );
    if (res?.presences) {
      let changed = false;
      for (const item of res.presences) {
        const existing = presenceMap.get(item.userId);
        if (!existing || item.updatedAt >= existing.updatedAt) {
          presenceMap.set(item.userId, item);
          changed = true;
        }
      }
      if (changed) notifyListeners();
      return res.presences;
    }
  } catch {
    // Ignore offline errors
  }
  return [];
}

// ── Micro-batching ───────────────────────────────────────────────────
// Every avatar that needs presence asks for its own id, so a list of N
// players used to produce N separate `presence:subscribe` round-trips for
// what the server is perfectly happy to answer in one.
//
// React runs all of a commit's mount effects in the same task, so the ids
// requested by one render land in the same queue and a microtask flush
// coalesces them into a single request. The wire format is unchanged and
// the response is applied through the same monotonic-timestamp merge as
// before, so realtime updates and staleness handling are untouched.

const pendingIds = new Set<string>();
/** Ids already on the wire — stops a second render re-requesting them. */
const inFlightIds = new Set<string>();
let flushScheduled = false;

async function flushPresenceQueue(): Promise<void> {
  flushScheduled = false;
  if (pendingIds.size === 0) return;

  const ids = Array.from(pendingIds);
  pendingIds.clear();
  for (const id of ids) inFlightIds.add(id);

  try {
    await fetchUserPresences(ids);
  } finally {
    // Always released, so a failed request can be retried by the next
    // mount rather than being permanently suppressed.
    for (const id of ids) inFlightIds.delete(id);
  }
}

/**
 * Request presence for ONE user, coalesced with every other id requested
 * in the same tick into a single round-trip.
 *
 * Skips ids already cached or already in flight, so re-renders and
 * duplicate avatars of the same player cost nothing. Returns a promise
 * that settles when the batch containing this id has been applied.
 */
export function queuePresenceFetch(userId?: string | null): Promise<void> {
  if (!userId) return Promise.resolve();
  if (presenceMap.has(userId) || inFlightIds.has(userId)) return Promise.resolve();

  pendingIds.add(userId);
  if (flushScheduled) return Promise.resolve();

  flushScheduled = true;
  return new Promise<void>((resolve) => {
    queueMicrotask(() => {
      void flushPresenceQueue().finally(resolve);
    });
  });
}

/** Test seam: drain the queue without waiting on the microtask. */
export function __flushPresenceQueueForTests(): Promise<void> {
  return flushPresenceQueue();
}

/** Test seam: drop all cached presence and queue state. */
export function __resetPresenceStoreForTests(): void {
  presenceMap.clear();
  pendingIds.clear();
  inFlightIds.clear();
  flushScheduled = false;
}

/**
 * Directly set local presence (for testing / initial state hydration).
 */
export function setLocalPresence(userId: string, status: PresenceState, updatedAt = Date.now()): void {
  const existing = presenceMap.get(userId);
  if (!existing || updatedAt >= existing.updatedAt) {
    presenceMap.set(userId, { userId, status, updatedAt });
    notifyListeners();
  }
}
