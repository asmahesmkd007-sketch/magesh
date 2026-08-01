// =====================================================================
// SOCKET CLIENT — one connection per tab, shared by every board
// ---------------------------------------------------------------------
// A single multiplexed Socket.IO connection serves the live game, the
// spectator feed and chat. Rooms do the routing server-side, so opening
// a second board (or a spectator tab) costs no extra socket.
//
// The connection carries the same Supabase access token the HTTP side
// sends as a bearer header — authentication is unchanged, only the
// transport is.
// =====================================================================
import { io, type Socket } from "socket.io-client";

import { supabase } from "@/integrations/supabase/client";
import { SOCKET_PATH, type ClientToServerEvents, type ServerToClientEvents } from "../protocol";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/**
 * The live socket, created on first use.
 *
 * `auth` is a callback rather than a value: socket.io-client re-invokes
 * it on every (re)connection attempt, so a session refreshed while the
 * tab was asleep reconnects with the *current* token instead of the one
 * that happened to be present at import time.
 */
export function getSocket(): AppSocket {
  if (socket) return socket;

  socket = io({
    path: SOCKET_PATH,
    // Same origin — the server is the page's own host.
    transports: ["websocket", "polling"],
    // Connect on demand; a page with no board never opens a socket.
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 400,
    reconnectionDelayMax: 4_000,
    // Never give up: a player on a train should rejoin their game when
    // signal returns, however long that takes.
    reconnectionAttempts: Number.POSITIVE_INFINITY,
    timeout: 10_000,
    auth: (cb: (data: { token?: string }) => void) => {
      supabase.auth
        .getSession()
        .then(({ data }) => cb({ token: data.session?.access_token }))
        // Anonymous is valid — it just means spectator-only.
        .catch(() => cb({}));
    },
  }) as AppSocket;

  return socket;
}

/** Ensure the shared socket is connected. Safe to call repeatedly. */
export function ensureConnected(): AppSocket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

/**
 * Promise wrapper around an emit-with-ack.
 *
 * Rejects on a server refusal so callers can `try/catch` a move the same
 * way they did the old server function, and times out rather than
 * hanging a UI action forever on a dead socket.
 */
export function request<K extends keyof ClientToServerEvents, R>(
  event: K,
  payload: unknown,
  timeoutMs = 10_000,
): Promise<R> {
  const s = ensureConnected();
  return new Promise<R>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("The server did not respond — check your connection."));
    }, timeoutMs);

    (s.emit as unknown as (e: string, p: unknown, ack: (r: unknown) => void) => void)(
      event as string,
      payload,
      (raw: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const response = raw as { ok: boolean; data?: R; message?: string } | undefined;
        if (response?.ok) resolve(response.data as R);
        else reject(new Error(response?.message ?? "Request failed"));
      },
    );
  });
}

/**
 * Estimated (serverTime - clientTime) in milliseconds.
 *
 * Clocks are rendered from server-stamped values, so a client whose
 * wall clock is off by minutes — which is common — would otherwise show
 * wildly wrong times. One round trip, halved for latency, is enough:
 * the clock only needs to be right to within a frame.
 */
let clockOffsetMs = 0;

export function getClockOffsetMs(): number {
  return clockOffsetMs;
}

/** Server-aligned "now". Everything clock-related should use this. */
export function serverNow(): number {
  return Date.now() + clockOffsetMs;
}

export async function syncClock(): Promise<number> {
  const sentAt = Date.now();
  try {
    const { serverTime } = await request<"time:sync", { serverTime: number; clientTime: number }>(
      "time:sync",
      { clientTime: sentAt },
      5_000,
    );
    const roundTrip = Date.now() - sentAt;
    // Assume the request and response legs are symmetric.
    clockOffsetMs = serverTime + roundTrip / 2 - Date.now();
  } catch {
    /* keep the previous estimate */
  }
  return clockOffsetMs;
}

/** Close the shared socket (sign-out, or a full teardown in tests). */
export function closeSocket(): void {
  socket?.close();
  socket = null;
  clockOffsetMs = 0;
}
