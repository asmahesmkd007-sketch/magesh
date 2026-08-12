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
