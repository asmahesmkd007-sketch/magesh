// =====================================================================
// GAME REGISTRY — the process's set of live games
// ---------------------------------------------------------------------
// Owns the lifecycle around LiveGame:
//
//   * single-flight hydration, so ten sockets joining the same game at
//     once produce one database read, not ten;
//   * the flag timer — a per-game timeout armed for the exact instant
//     the side to move runs out, so a game ends on time even if both
//     clients are gone. This replaces the old client-side "claim
//     timeout" RPC, which could only fire while someone was watching;
//   * a coarse checkpoint sweep for crash resilience;
//   * eviction of finished/idle games so memory tracks concurrent games
//     rather than total games ever played.
// =====================================================================
import { LiveGame } from "./LiveGame";
import { checkpoint, finalize, forgetPersistenceState, hydrate } from "./persistence";
import { logger } from "@/lib/logger";
import type { TerminalPayload } from "../protocol";

/** How often dirty in-progress games are checkpointed. */
const CHECKPOINT_INTERVAL_MS = 30_000;
/** How long a finished game stays resident so late joiners still see it. */
const FINISHED_TTL_MS = 60_000;
/** How long an active game with nobody connected stays resident. */
const IDLE_TTL_MS = 10 * 60_000;
/** Small grace so the server never flags a player a hair early. */
const FLAG_GRACE_MS = 50;

type Entry = {
  game: LiveGame;
  flagTimer: ReturnType<typeof setTimeout> | null;
  /** Sockets currently attached, by user id (a user may have two tabs). */
  connections: Set<string>;
};

const entries = new Map<string, Entry>();
const hydrating = new Map<string, Promise<LiveGame | null>>();

/** Fired when a game ends on its own (flag fall) with nobody to tell us. */
type TerminalListener = (gameId: string, terminal: TerminalPayload) => void;
let onTerminal: TerminalListener = () => {};

export function setTerminalListener(listener: TerminalListener): void {
  onTerminal = listener;
}

/**
 * Get a game, loading it from the database on first use. Concurrent
 * callers share one in-flight load.
 */
export async function acquire(gameId: string): Promise<LiveGame | null> {
  const existing = entries.get(gameId);
  if (existing) return existing.game;

  const inFlight = hydrating.get(gameId);
  if (inFlight) return inFlight;

  const load = hydrate(gameId)
    .then((game) => {
      // Another caller may have won the race while we were awaiting.
      const raced = entries.get(gameId);
      if (raced) return raced.game;
      if (game) {
        entries.set(gameId, { game, flagTimer: null, connections: new Set() });
        armFlagTimer(gameId);
      }
      return game;
    })
    .catch((error) => {
      logger.error("Realtime hydrate failed", { error, gameId });
      return null;
    })
    .finally(() => {
      hydrating.delete(gameId);
    });

  hydrating.set(gameId, load);
  return load;
}

export function peek(gameId: string): LiveGame | null {
  return entries.get(gameId)?.game ?? null;
}

export function attach(gameId: string, userId: string): void {
  entries.get(gameId)?.connections.add(userId);
}

export function detach(gameId: string, userId: string): void {
  entries.get(gameId)?.connections.delete(userId);
}

export function isOnline(gameId: string, userId: string): boolean {
  return entries.get(gameId)?.connections.has(userId) ?? false;
}

/**
 * (Re)schedule the flag timer for a game. Called after every move and
 * after hydration — the timer fires once, at the exact instant the side
 * to move would run out, instead of polling.
 */
export function armFlagTimer(gameId: string): void {
  const entry = entries.get(gameId);
  if (!entry) return;
  if (entry.flagTimer) {
    clearTimeout(entry.flagTimer);
    entry.flagTimer = null;
  }
  const flagLeft = entry.game.msUntilFlag();
  const deadlineLeft = entry.game.msUntilMoveDeadline();
  const times = [flagLeft, deadlineLeft].filter((t): t is number => t !== null);
  if (times.length === 0) return;

  const minLeft = Math.min(...times);

  entry.flagTimer = setTimeout(() => {
    entry.flagTimer = null;
    const deadlineTerm = entry.game.checkMoveDeadline();
    if (deadlineTerm) {
      onTerminal(gameId, deadlineTerm);
      void finalize(entry.game).catch(() => {});
      return;
    }
    const flagTerm = entry.game.checkFlag();
    if (flagTerm) {
      onTerminal(gameId, flagTerm);
      void finalize(entry.game).catch(() => {});
      return;
    }
    // Not actually down yet — re-arm rather than leaving the game unwatched.
    armFlagTimer(gameId);
  }, minLeft + FLAG_GRACE_MS);
  // Never hold the process open for a chess clock.
  entry.flagTimer.unref?.();
}

export function cancelFlagTimer(gameId: string): void {
  const entry = entries.get(gameId);
  if (entry?.flagTimer) {
    clearTimeout(entry.flagTimer);
    entry.flagTimer = null;
  }
}

function evict(gameId: string): void {
  cancelFlagTimer(gameId);
  entries.delete(gameId);
  forgetPersistenceState(gameId);
}

/** Checkpoint dirty games and drop ones nobody needs any more. */
async function sweep(): Promise<void> {
  const now = Date.now();
  for (const [gameId, entry] of [...entries]) {
    const { game, connections } = entry;

    if (game.status === "finished") {
      // Make sure it actually reached the database before dropping it.
      if (!game.persisted) {
        try {
          await finalize(game);
        } catch {
          continue; // leave resident and retry next sweep
        }
      }
      if (now - game.lastActivityAt > FINISHED_TTL_MS) evict(gameId);
      continue;
    }

    if (game.dirty) await checkpoint(game);

    if (connections.size === 0 && now - game.lastActivityAt > IDLE_TTL_MS) {
      // Its position and clock are checkpointed; a later join re-hydrates.
      evict(gameId);
    }
  }
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startRegistry(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    void sweep();
  }, CHECKPOINT_INTERVAL_MS);
  sweepTimer.unref?.();
}

/**
 * Flush everything on the way down. A rolling deploy gets a clean
 * handover: finished games are written, in-progress ones checkpointed,
 * so reconnecting players resume rather than lose the board.
 */
export async function shutdownRegistry(): Promise<void> {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
  const pending: Promise<unknown>[] = [];
  for (const [gameId, entry] of entries) {
    cancelFlagTimer(gameId);
    const { game } = entry;
    pending.push(
      game.status === "finished"
        ? finalize(game).catch(() => {})
        : checkpoint(game).catch(() => {}),
    );
  }
  await Promise.allSettled(pending);
}

/** Diagnostics for /healthz. */
export function registryStats() {
  let active = 0;
  let finished = 0;
  let connections = 0;
  for (const entry of entries.values()) {
    if (entry.game.status === "finished") finished++;
    else active++;
    connections += entry.connections.size;
  }
  return { games: entries.size, active, finished, connections };
}
