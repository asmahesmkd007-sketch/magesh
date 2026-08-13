/**
 * Global authoritative state for active live chess matches.
 * Derived from authoritative game status ("active" / "in_progress").
 */

let activeGameId: string | null = null;
let activeMatchPlaying: boolean = false;

/**
 * Update active live match state.
 * Called by authoritative live game connections (e.g. useLiveGame).
 */
export function setActiveLiveMatch(gameId: string | null, isPlaying: boolean): void {
  activeGameId = isPlaying ? gameId : null;
  activeMatchPlaying = isPlaying;
}

/**
 * Reset active match state (for cleanup or testing).
 */
export function resetActiveLiveMatch(): void {
  activeGameId = null;
  activeMatchPlaying = false;
}

/**
 * Returns true ONLY when the user is currently playing an active live chess match in progress.
 */
export function isLiveMatchActive(): boolean {
  if (!activeMatchPlaying || !activeGameId) {
    return false;
  }

  if (typeof window !== "undefined") {
    const path = window.location.pathname;
    // Game review routes or non-game routes do not count as active live matches
    if (path.endsWith("/review")) {
      return false;
    }
  }

  return true;
}

/**
 * Global notification click handler.
 * Default: Navigates to /notifications page.
 * Exception: During active live chess match, click is a no-op (stay on match).
 */
export function handleNotificationClick(navigate?: (options: { to: string }) => void): void {
  if (isLiveMatchActive()) {
    // Ignore notification click during active live chess match.
    return;
  }

  if (navigate) {
    navigate({ to: "/notifications" });
  } else if (typeof window !== "undefined") {
    window.location.href = "/notifications";
  }
}
