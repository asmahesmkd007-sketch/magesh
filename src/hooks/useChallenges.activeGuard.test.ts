// =====================================================================
// The challenge-accepted auto-navigation, guarded by the live-match flag.
//
// This is the *real* in-game navigation path — the one that could move a
// player off a live board without them touching anything. It matters more
// than a notification click, because the player never consented to it.
//
// The branch itself is a few lines inside a postgres_changes callback in
// useChallenges; the decision it makes is reproduced here against the
// same guard the hook calls, so the rule is pinned even though the
// surrounding subscription needs a live Supabase channel to exercise.
// =====================================================================
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isLiveMatchActive, resetActiveLiveMatch, setActiveLiveMatch } from "@/lib/activeMatch";

/**
 * The exact branch from useChallenges: on an accepted challenge, enter
 * the new game — unless the player is already at a live board.
 */
function onChallengeAccepted(
  gameId: string,
  navigate: (opts: { to: string; params: { id: string } }) => void,
  toastSuccess: (msg: string) => void,
) {
  if (isLiveMatchActive()) {
    toastSuccess("Friend accepted your challenge — it's ready when you finish here.");
    return;
  }
  toastSuccess("Friend accepted your challenge! Entering game...");
  navigate({ to: "/game/$id", params: { id: gameId } });
}

describe("challenge acceptance never interrupts a live game", () => {
  let navigate: ReturnType<typeof vi.fn>;
  let toastSuccess: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetActiveLiveMatch();
    navigate = vi.fn();
    toastSuccess = vi.fn();
  });

  it("enters the new game when the player is not in one", () => {
    onChallengeAccepted("new-game", navigate, toastSuccess);
    expect(navigate).toHaveBeenCalledWith({ to: "/game/$id", params: { id: "new-game" } });
  });

  it("does NOT navigate away while a live match is in progress", () => {
    setActiveLiveMatch("game-in-progress", true);
    onChallengeAccepted("new-game", navigate, toastSuccess);

    // The board, the clock and the position are all untouched: nothing
    // moved the player off them.
    expect(navigate).not.toHaveBeenCalled();
    expect(isLiveMatchActive()).toBe(true);
  });

  it("still tells the player the challenge was accepted", () => {
    setActiveLiveMatch("game-in-progress", true);
    onChallengeAccepted("new-game", navigate, toastSuccess);
    expect(toastSuccess).toHaveBeenCalledWith(
      "Friend accepted your challenge — it's ready when you finish here.",
    );
  });

  it("resumes normal navigation once the live game ends", () => {
    setActiveLiveMatch("game-in-progress", true);
    onChallengeAccepted("new-game", navigate, toastSuccess);
    expect(navigate).not.toHaveBeenCalled();

    // Game over: the guard releases.
    setActiveLiveMatch("game-in-progress", false);
    onChallengeAccepted("new-game", navigate, toastSuccess);
    expect(navigate).toHaveBeenCalledWith({ to: "/game/$id", params: { id: "new-game" } });
  });

  it("treats a finished game as no longer live", () => {
    // useLiveGame passes `status === "active"`; anything else releases.
    setActiveLiveMatch("game-over", false);
    expect(isLiveMatchActive()).toBe(false);
    onChallengeAccepted("new-game", navigate, toastSuccess);
    expect(navigate).toHaveBeenCalled();
  });
});
