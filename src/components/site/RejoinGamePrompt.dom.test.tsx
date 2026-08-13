// @vitest-environment jsdom
// =====================================================================
// The returning-player flow: detect, offer, rejoin — or cancel and leave
// the game entirely alone.
// =====================================================================
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RejoinableGame } from "@/lib/rejoin/eligibility";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const GAME_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GAME_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// ── Doubles ───────────────────────────────────────────────────────────

const navigate = vi.fn(() => Promise.resolve());
let pathname = "/home";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname } }),
}));

let authUser: { id: string } | null = { id: "player-me" };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authUser, session: null, loading: false }),
}));

/** What the server says this user may resume. */
let serverGames: RejoinableGame[] = [];
let authorizeResult: { ok: boolean; gameId?: string; color?: string; reason?: string };
type AuthorizeArgs = { data: { gameId: string } };
const fetchActive = vi.fn(() => Promise.resolve({ games: serverGames }));
const authorize = vi.fn((_args: AuthorizeArgs) => Promise.resolve(authorizeResult));

vi.mock("@/lib/api/rejoin.functions", () => ({
  fetchActiveGamesServerFn: () => fetchActive(),
  authorizeRejoinServerFn: (args: AuthorizeArgs) => authorize(args),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: toastError, info: vi.fn(), success: vi.fn() } }));

// Session locking must be untouched by any of this.
const sessionLockSpies = {
  resetSessionId: vi.fn(),
  clearSessionId: vi.fn(),
  suppressSessionLock: vi.fn(),
  releaseSessionLockSuppression: vi.fn(),
};
vi.mock("@/lib/auth/sessionLock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/sessionLock")>();
  return { ...actual, ...sessionLockSpies };
});

const { RejoinGamePrompt } = await import("./RejoinGamePrompt");
const { __resetDismissals } = await import("@/hooks/useRejoinableGame");

// ── Harness ───────────────────────────────────────────────────────────

let container: HTMLDivElement;
let root: Root;

function game(overrides: Partial<RejoinableGame> = {}): RejoinableGame {
  return {
    gameId: GAME_A,
    color: "w",
    whiteUsername: "magnus",
    blackUsername: "hikaru",
    timeControl: "5+0",
    isRated: true,
    movesCount: 14,
    lastMoveAt: 1_700_000_000_000,
    ...overrides,
  };
}

async function mount() {
  await act(async () => {
    root.render(<RejoinGamePrompt />);
  });
}

const text = () => container.textContent ?? "";

function buttonWith(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").trim().toLowerCase().includes(label.toLowerCase()),
  );
  if (!match) throw new Error(`No button matching "${label}" in: ${text()}`);
  return match as HTMLButtonElement;
}

async function click(label: string) {
  const button = buttonWith(label);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  __resetDismissals();
  navigate.mockClear();
  fetchActive.mockClear();
  authorize.mockClear();
  toastError.mockClear();
  for (const spy of Object.values(sessionLockSpies)) spy.mockClear();
  pathname = "/home";
  authUser = { id: "player-me" };
  serverGames = [];
  authorizeResult = { ok: true, gameId: GAME_A, color: "w" };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

// ── Detection ─────────────────────────────────────────────────────────

describe("active-game detection", () => {
  it("asks the server — once — after authentication", async () => {
    serverGames = [game()];
    await mount();
    expect(fetchActive).toHaveBeenCalledTimes(1);
  });

  it("shows the ongoing-game prompt with both actions", async () => {
    serverGames = [game()];
    await mount();

    expect(text()).toContain("You have an ongoing game");
    expect(text()).toContain("Your match is still in progress.");
    expect(buttonWith("Rejoin Game")).toBeTruthy();
    expect(buttonWith("Cancel")).toBeTruthy();
  });

  it("shows the existing game's own metadata, White vs Black", async () => {
    serverGames = [game()];
    await mount();
    expect(text()).toContain("magnus");
    expect(text()).toContain("hikaru");
    expect(text()).toContain("5+0");
    expect(text()).toContain("You are White");
  });

  it("renders nothing when the server reports no active game", async () => {
    serverGames = [];
    await mount();
    expect(container.innerHTML).toBe("");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("never navigates the user on its own", async () => {
    serverGames = [game()];
    await mount();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not ask, or prompt, for a signed-out visitor", async () => {
    authUser = null;
    serverGames = [game()];
    await mount();
    expect(fetchActive).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });

  it("stays out of the way while the player is already on a board", async () => {
    pathname = `/game/${GAME_A}`;
    serverGames = [game()];
    await mount();
    expect(fetchActive).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });

  it("offers a choice rather than picking one when several games are live", async () => {
    serverGames = [game(), game({ gameId: GAME_B, whiteUsername: "anna", color: "b" })];
    await mount();

    expect(text()).toContain("You have 2 ongoing games");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(navigate).not.toHaveBeenCalled();
  });
});

// ── Rejoin ────────────────────────────────────────────────────────────

describe("Rejoin Game", () => {
  it("authorizes with the server and reuses the existing game id", async () => {
    serverGames = [game()];
    await mount();
    await click("Rejoin Game");

    expect(authorize).toHaveBeenCalledWith({ data: { gameId: GAME_A } });
    expect(navigate).toHaveBeenCalledWith({ to: "/game/$id", params: { id: GAME_A } });
  });

  it("navigates to the id the SERVER returned, not the one the client held", async () => {
    serverGames = [game()];
    authorizeResult = { ok: true, gameId: GAME_A, color: "b" };
    await mount();
    await click("Rejoin Game");
    expect(navigate).toHaveBeenCalledWith({ to: "/game/$id", params: { id: GAME_A } });
  });

  it("refuses and explains when the server says the game is over", async () => {
    serverGames = [game()];
    authorizeResult = { ok: false, reason: "not_active" };
    await mount();
    await click("Rejoin Game");

    expect(navigate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("That game has already finished.");
  });

  it("refuses when the caller is not a player in that game", async () => {
    serverGames = [game()];
    authorizeResult = { ok: false, reason: "not_a_player" };
    await mount();
    await click("Rejoin Game");

    expect(navigate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("You are not a player in that game.");
  });

  it("refuses to resurrect a game that already ended on time", async () => {
    serverGames = [game()];
    authorizeResult = { ok: false, reason: "expired" };
    await mount();
    await click("Rejoin Game");

    expect(navigate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("That game has already ended on time.");
  });

  it("creates no game, ever — the only server call is the authorization", async () => {
    serverGames = [game()];
    await mount();
    await click("Rejoin Game");
    await click("Rejoin Game").catch(() => {});

    // One lookup, and one authorization per press. Nothing else.
    expect(fetchActive).toHaveBeenCalledTimes(1);
    for (const call of authorize.mock.calls) {
      expect(call[0]).toEqual({ data: { gameId: GAME_A } });
    }
  });

  it("leaves the single-device session lock completely alone", async () => {
    serverGames = [game()];
    await mount();
    await click("Rejoin Game");

    expect(sessionLockSpies.resetSessionId).not.toHaveBeenCalled();
    expect(sessionLockSpies.clearSessionId).not.toHaveBeenCalled();
    expect(sessionLockSpies.suppressSessionLock).not.toHaveBeenCalled();
    expect(sessionLockSpies.releaseSessionLockSuppression).not.toHaveBeenCalled();
  });
});

// ── Cancel ────────────────────────────────────────────────────────────

describe("Cancel", () => {
  it("dismisses the prompt without touching the game", async () => {
    serverGames = [game()];
    await mount();
    await click("Cancel");

    expect(container.innerHTML).toBe("");
    // Cancel is a UI action: no authorization, no navigation, and — since
    // resign/abort live on the socket, which this component never opens —
    // no way for it to have ended anything.
    expect(authorize).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not create, delete or re-fetch anything", async () => {
    serverGames = [game()];
    await mount();
    const lookups = fetchActive.mock.calls.length;
    await click("Cancel");
    expect(fetchActive).toHaveBeenCalledTimes(lookups);
  });

  it("offers the game again on a later visit while it stays rejoinable", async () => {
    serverGames = [game()];
    await mount();
    await click("Cancel");
    expect(container.innerHTML).toBe("");

    // A later visit is a fresh page load: the dismissal was in-memory and
    // dies with it, and the server still reports the game as live.
    await act(async () => root.unmount());
    __resetDismissals();
    root = createRoot(container);
    await mount();

    expect(text()).toContain("You have an ongoing game");
    expect(buttonWith("Rejoin Game")).toBeTruthy();
  });

  it("keeps the dismissal for the rest of this page load", async () => {
    serverGames = [game()];
    await mount();
    await click("Cancel");

    // Navigating around remounts the prompt; it must not nag again.
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount();
    expect(container.innerHTML).toBe("");
  });
});
