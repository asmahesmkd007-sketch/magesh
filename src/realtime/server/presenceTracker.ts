import type { Server, Socket } from "socket.io";
import {
  rooms,
  type ClientToServerEvents,
  type PresenceState,
  type ServerToClientEvents,
  type UserPresence,
} from "../protocol";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, { userId: string | null }>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, never, { userId: string | null }>;

/** Disconnect grace period (3 seconds) to survive temporary network blips / page reloads */
export const DISCONNECT_GRACE_MS = 3000;

// userId -> Set<socketId>
const userSockets = new Map<string, Set<string>>();
// userId -> monotonic epoch ms of latest state change
const userVersions = new Map<string, number>();
// userId -> disconnect timer
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Handle new authenticated socket connection.
 */
export function onSocketConnected(socket: AppSocket, userId: string, io: AppServer): void {
  // Cancel pending disconnect grace timer if user re-connected / opened another tab
  const existingTimer = disconnectTimers.get(userId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    disconnectTimers.delete(userId);
  }

  let sockets = userSockets.get(userId);
  const wasOnline = !!(sockets && sockets.size > 0);

  if (!sockets) {
    sockets = new Set<string>();
    userSockets.set(userId, sockets);
  }
  sockets.add(socket.id);

  // Join the global presence room
  void socket.join(rooms.globalPresence);

  // If transition from offline -> online, broadcast update to all connected clients
  if (!wasOnline) {
    const updatedAt = Date.now();
    userVersions.set(userId, updatedAt);
    const update: UserPresence = { userId, status: "online", updatedAt };
    io.to(rooms.globalPresence).emit("presence:update", { presences: [update] });
  }

  // Send current snapshot of all online users to this newly connected socket
  const onlineSnapshot = getOnlineSnapshot();
  socket.emit("presence:snapshot", { presences: onlineSnapshot });
}

/**
 * Handle socket disconnection.
 */
export function onSocketDisconnected(socket: AppSocket, userId: string, io: AppServer): void {
  const sockets = userSockets.get(userId);
  if (!sockets) return;

  sockets.delete(socket.id);

  if (sockets.size === 0) {
    // Start grace period before marking user offline
    const timer = setTimeout(() => {
      disconnectTimers.delete(userId);
      const currentSockets = userSockets.get(userId);
      if (!currentSockets || currentSockets.size === 0) {
        userSockets.delete(userId);
        const updatedAt = Date.now();
        userVersions.set(userId, updatedAt);
        const update: UserPresence = { userId, status: "offline", updatedAt };
        io.to(rooms.globalPresence).emit("presence:update", { presences: [update] });
      }
    }, DISCONNECT_GRACE_MS);

    disconnectTimers.set(userId, timer);
  }
}

/**
 * Returns snapshot of all currently online users.
 */
export function getOnlineSnapshot(): UserPresence[] {
  const list: UserPresence[] = [];
  const now = Date.now();
  for (const [userId, sockets] of userSockets.entries()) {
    if (sockets.size > 0) {
      const updatedAt = userVersions.get(userId) ?? now;
      list.push({ userId, status: "online", updatedAt });
    }
  }
  return list;
}

/**
 * Returns presence state for requested user IDs.
 */
export function getPresenceForUserIds(userIds: string[]): UserPresence[] {
  const now = Date.now();
  return userIds.map((userId) => {
    const online = isUserOnline(userId);
    return {
      userId,
      status: (online ? "online" : "offline") as PresenceState,
      updatedAt: userVersions.get(userId) ?? now,
    };
  });
}

/**
 * Returns whether user is currently online.
 * Returns true if user has active sockets OR if disconnect grace period is pending.
 */
export function isUserOnline(userId: string): boolean {
  const sockets = userSockets.get(userId);
  if (sockets && sockets.size > 0) return true;
  if (disconnectTimers.has(userId)) return true;
  return false;
}

/**
 * Reset presence state (for unit testing).
 */
export function resetPresenceTracker(): void {
  for (const timer of disconnectTimers.values()) clearTimeout(timer);
  disconnectTimers.clear();
  userSockets.clear();
  userVersions.clear();
}
