import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISCONNECT_GRACE_MS,
  getOnlineSnapshot,
  getPresenceForUserIds,
  isUserOnline,
  onSocketConnected,
  onSocketDisconnected,
  resetPresenceTracker,
} from "./presenceTracker";

const USER_1 = "10000000-0000-0000-0000-000000000001";
const USER_2 = "20000000-0000-0000-0000-000000000002";

function createMockIo() {
  const emittedEvents: { room: string; event: string; payload: any }[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => {
        emittedEvents.push({ room, event, payload });
      },
    }),
  } as any;
  return { io, emittedEvents };
}

function createMockSocket(id: string) {
  const roomsJoined = new Set<string>();
  const emitted: { event: string; payload: any }[] = [];
  const socket = {
    id,
    join: (r: string) => roomsJoined.add(r),
    emit: (event: string, payload: any) => emitted.push({ event, payload }),
  } as any;
  return { socket, roomsJoined, emitted };
}

describe("Real-Time Presence Tracker Suite", () => {
  beforeEach(() => {
    resetPresenceTracker();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetPresenceTracker();
  });

  it("1. User login / connection sets status to ONLINE and broadcasts update", () => {
    const { io, emittedEvents } = createMockIo();
    const { socket } = createMockSocket("socket_a_1");

    onSocketConnected(socket, USER_1, io);

    expect(isUserOnline(USER_1)).toBe(true);
    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0].event).toBe("presence:update");
    expect(emittedEvents[0].payload.presences[0]).toMatchObject({
      userId: USER_1,
      status: "online",
    });
  });

  it("2. Multiple tabs / sockets keep user ONLINE when one tab closes", () => {
    const { io, emittedEvents } = createMockIo();
    const s1 = createMockSocket("tab_1").socket;
    const s2 = createMockSocket("tab_2").socket;

    // Tab 1 connects
    onSocketConnected(s1, USER_1, io);
    expect(isUserOnline(USER_1)).toBe(true);

    // Tab 2 connects
    onSocketConnected(s2, USER_1, io);
    expect(isUserOnline(USER_1)).toBe(true);

    // Tab 1 closes
    onSocketDisconnected(s1, USER_1, io);
    vi.advanceTimersByTime(DISCONNECT_GRACE_MS + 1000);

    // User is STILL ONLINE because Tab 2 remains active!
    expect(isUserOnline(USER_1)).toBe(true);
  });

  it("3. User transitions to OFFLINE after disconnect grace period when all tabs close", () => {
    const { io, emittedEvents } = createMockIo();
    const s1 = createMockSocket("tab_1").socket;

    onSocketConnected(s1, USER_1, io);
    expect(isUserOnline(USER_1)).toBe(true);

    emittedEvents.length = 0; // Clear initial connect event
    onSocketDisconnected(s1, USER_1, io);

    // During grace period (e.g. 1500ms), user remains ONLINE
    vi.advanceTimersByTime(1500);
    expect(isUserOnline(USER_1)).toBe(true);

    // After full grace period (3000ms)
    vi.advanceTimersByTime(2000);
    expect(isUserOnline(USER_1)).toBe(false);

    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0].event).toBe("presence:update");
    expect(emittedEvents[0].payload.presences[0]).toMatchObject({
      userId: USER_1,
      status: "offline",
    });
  });

  it("4. Quick reconnect within grace period cancels offline transition", () => {
    const { io, emittedEvents } = createMockIo();
    const s1 = createMockSocket("tab_1").socket;
    const s2 = createMockSocket("tab_2_reconnect").socket;

    onSocketConnected(s1, USER_1, io);
    emittedEvents.length = 0;

    // Disconnect tab 1
    onSocketDisconnected(s1, USER_1, io);

    // 1000ms later, client reconnects on tab 2
    vi.advanceTimersByTime(1000);
    onSocketConnected(s2, USER_1, io);

    // Advance past original grace period
    vi.advanceTimersByTime(5000);

    // User remains ONLINE continuously without any offline event broadcasted!
    expect(isUserOnline(USER_1)).toBe(true);
    const offlineEvents = emittedEvents.filter(
      (e) => e.payload.presences[0]?.status === "offline",
    );
    expect(offlineEvents.length).toBe(0);
  });

  it("5. Presence snapshot returns accurate online states for requested user IDs", () => {
    const { io } = createMockIo();
    const s1 = createMockSocket("tab_1").socket;

    onSocketConnected(s1, USER_1, io);

    const snapshot = getPresenceForUserIds([USER_1, USER_2]);
    expect(snapshot).toHaveLength(2);
    expect(snapshot.find((p) => p.userId === USER_1)?.status).toBe("online");
    expect(snapshot.find((p) => p.userId === USER_2)?.status).toBe("offline");
  });

  it("6. Monotonic timestamps protect against stale events", () => {
    const { io } = createMockIo();
    const s1 = createMockSocket("tab_1").socket;

    const t0 = Date.now();
    onSocketConnected(s1, USER_1, io);

    const onlineSnap = getPresenceForUserIds([USER_1]);
    expect(onlineSnap[0].updatedAt).toBeGreaterThanOrEqual(t0);
  });
});
