// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { VsComputer } from "./VsComputer";

// Polyfill ResizeObserver & Worker for JSDOM
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

global.Worker = class Worker {
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true;
  }
  onmessage() {}
  onerror() {}
} as any;

// Mock router navigation
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

// Mock audio
vi.mock("@/lib/audio/sounds", () => ({
  playGameSound: vi.fn(),
  soundForChessMove: vi.fn(),
}));

// Mock haptics
vi.mock("@/lib/haptics", () => ({
  buzz: vi.fn(),
}));

// Mock Auth hook
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
  useProfile: () => ({ profile: null }),
}));

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null }),
          }),
        }),
      }),
    }),
  },
}));

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("VsComputer Board Sizing Lock", () => {
  it("locks board dimensions during gameplay and prevents dynamic resizing", async () => {
    await act(async () => {
      root.render(
        <StrictMode>
          <VsComputer />
        </StrictMode>,
      );
    });

    // Click 'Begin the Battle' to enter playing phase
    const beginBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Begin the Battle"),
    );
    expect(beginBtn).not.toBeNull();

    await act(async () => {
      beginBtn?.click();
    });

    // Select board wrapper
    const boardContainer = container.querySelector(".cx-board-root")?.parentElement;
    expect(boardContainer).not.toBeNull();

    const initialStyleWidth = boardContainer?.style.width;
    const initialStyleHeight = boardContainer?.style.height;

    // Both width and height must be explicitly set and equal (1:1 aspect ratio)
    expect(initialStyleWidth).toBeDefined();
    expect(initialStyleHeight).toBeDefined();
    expect(initialStyleWidth).toBe(initialStyleHeight);

    // Make moves and verify dimensions stay identical
    const squares = container.querySelectorAll<HTMLButtonElement>("button[aria-label]");
    const e2Square = Array.from(squares).find((s) => s.getAttribute("aria-label")?.includes("e2"));
    if (e2Square) {
      await act(async () => {
        e2Square.click();
      });
      const e4Square = Array.from(squares).find((s) => s.getAttribute("aria-label")?.includes("e4"));
      if (e4Square) {
        await act(async () => {
          e4Square.click();
        });
      }
    }

    // Measure style dimensions after move
    const afterMoveStyleWidth = boardContainer?.style.width;
    const afterMoveStyleHeight = boardContainer?.style.height;

    expect(afterMoveStyleWidth).toBe(initialStyleWidth);
    expect(afterMoveStyleHeight).toBe(initialStyleHeight);
  });
});
