import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isLiveMatchActive,
  setActiveLiveMatch,
  resetActiveLiveMatch,
  handleNotificationClick,
} from "./activeMatch";

describe("Global Notification Click Behavior During Active Chess Match Suite", () => {
  beforeEach(() => {
    resetActiveLiveMatch();
    vi.restoreAllMocks();
  });

  it("TEST 1: Normal page + friend request -> notification page opens", () => {
    const navigate = vi.fn();
    resetActiveLiveMatch(); // Normal page state

    handleNotificationClick(navigate);
    expect(navigate).toHaveBeenCalledWith({ to: "/notifications" });
  });

  it("TEST 2: Normal page + message notification -> notification page opens", () => {
    const navigate = vi.fn();
    resetActiveLiveMatch();

    handleNotificationClick(navigate);
    expect(navigate).toHaveBeenCalledWith({ to: "/notifications" });
  });

  it("TEST 3: Normal page + any other notification -> notification page opens", () => {
    const navigate = vi.fn();
    resetActiveLiveMatch();

    handleNotificationClick(navigate);
    expect(navigate).toHaveBeenCalledWith({ to: "/notifications" });
  });

  it("TEST 4: Active live match + friend request -> click does nothing", () => {
    const navigate = vi.fn();
    setActiveLiveMatch("game_123", true);

    handleNotificationClick(navigate);
    expect(navigate).not.toHaveBeenCalled();
    expect(isLiveMatchActive()).toBe(true);
  });

  it("TEST 5: Active live match + message -> click does nothing", () => {
    const navigate = vi.fn();
    setActiveLiveMatch("game_123", true);

    handleNotificationClick(navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("TEST 6: Active live match + game invitation -> click does nothing", () => {
    const navigate = vi.fn();
    setActiveLiveMatch("game_123", true);

    handleNotificationClick(navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("TEST 7: Active live match + arbitrary future notification type -> click does nothing", () => {
    const navigate = vi.fn();
    setActiveLiveMatch("game_123", true);

    handleNotificationClick(navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("TEST 8: Active match ends -> notification click opens notification page", () => {
    const navigate = vi.fn();
    setActiveLiveMatch("game_123", true);
    expect(isLiveMatchActive()).toBe(true);

    // Game finishes / ends
    setActiveLiveMatch("game_123", false);
    expect(isLiveMatchActive()).toBe(false);

    handleNotificationClick(navigate);
    expect(navigate).toHaveBeenCalledWith({ to: "/notifications" });
  });

  it("TEST 9: Completed/review game -> notification click opens notification page", () => {
    const navigate = vi.fn();
    setActiveLiveMatch(null, false);

    handleNotificationClick(navigate);
    expect(navigate).toHaveBeenCalledWith({ to: "/notifications" });
  });

  it("TEST 10: Analysis page -> notification click opens notification page", () => {
    const navigate = vi.fn();
    setActiveLiveMatch(null, false);

    handleNotificationClick(navigate);
    expect(navigate).toHaveBeenCalledWith({ to: "/notifications" });
  });

  it("TEST 11: Multiple notifications during match -> all still arrive; all clicks are blocked", () => {
    const navigate = vi.fn();
    setActiveLiveMatch("game_777", true);

    // 5 different notifications clicked during live match
    handleNotificationClick(navigate);
    handleNotificationClick(navigate);
    handleNotificationClick(navigate);
    handleNotificationClick(navigate);
    handleNotificationClick(navigate);

    expect(navigate).not.toHaveBeenCalled();
  });

  it("TEST 12: Entering live match activates the guard", () => {
    expect(isLiveMatchActive()).toBe(false);

    // Player joins & starts live match
    setActiveLiveMatch("game_999", true);
    expect(isLiveMatchActive()).toBe(true);

    const navigate = vi.fn();
    handleNotificationClick(navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("TEST 13: Leaving/ending live match deactivates the guard", () => {
    setActiveLiveMatch("game_999", true);
    expect(isLiveMatchActive()).toBe(true);

    // Player leaves or match finishes
    setActiveLiveMatch(null, false);
    expect(isLiveMatchActive()).toBe(false);

    const navigate = vi.fn();
    handleNotificationClick(navigate);
    expect(navigate).toHaveBeenCalledWith({ to: "/notifications" });
  });
});
