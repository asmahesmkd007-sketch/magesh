// @vitest-environment jsdom
// Covers importFen's custom-position transparency. The engine analyses
// whatever the FEN says, so the one thing that must reach the user is
// which side the position names — otherwise correct White arrows on a
// board the reader assumed was Black's look like a bug.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { START_FEN } from "@/lib/chess/moveTree";
import { useAnalysisSession } from "./useAnalysisSession";

// The audit position: accepted by chess.js, retrograde-impossible, and the
// exact shape that produced White arrows on a board showing a g4 pawn.
const G4_WHITE = "rnbqkbnr/pppppppp/8/8/6P1/8/PPPPPP1P/RNBQKBNR w KQkq - 0 1";
const G4_BLACK = "rnbqkbnr/pppppppp/8/8/6P1/8/PPPPPP1P/RNBQKBNR b KQkq - 0 1";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;
let session: ReturnType<typeof useAnalysisSession>;

function Probe() {
  session = useAnalysisSession();
  return null;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Probe />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("importFen custom-position transparency", () => {
  it("A. reports White to move and keeps the supplied FEN authoritative", () => {
    let result!: ReturnType<typeof session.importFen>;
    act(() => {
      result = session.importFen(G4_WHITE);
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings).toEqual(["Custom position loaded — White to move."]);
    // Not repaired, not flipped: the active color is still exactly "w".
    expect(session.fen).toBe(G4_WHITE);
    expect(session.fen.split(" ")[1]).toBe("w");
    expect(session.tree.rootFen).toBe(G4_WHITE);
  });

  it("B. reports Black to move for the same placement with active color b", () => {
    let result!: ReturnType<typeof session.importFen>;
    act(() => {
      result = session.importFen(G4_BLACK);
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings).toEqual(["Custom position loaded — Black to move."]);
    expect(session.fen).toBe(G4_BLACK);
    expect(session.fen.split(" ")[1]).toBe("b");
  });

  it("F. importing the standard start produces no custom-position notice", () => {
    let result!: ReturnType<typeof session.importFen>;
    act(() => {
      result = session.importFen(START_FEN);
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings).toEqual([]);
    expect(session.tree.rootFen).toBe(START_FEN);
  });

  it("F2. normal play from a fresh session still flips the active color", () => {
    // The untouched path: GameTree.play derives the FEN via chess.js.
    act(() => {
      session.playMove({ from: "g2", to: "g4" });
    });
    expect(session.fen.split(" ")[1]).toBe("b");
  });

  it("G. a custom root is distinguishable from the standard one", () => {
    // The predicate behind the toolbar indicator.
    expect(session.tree.rootFen).toBe(START_FEN);
    act(() => {
      session.importFen(G4_WHITE);
    });
    expect(session.tree.rootFen).toBe(G4_WHITE);
    expect(session.tree.rootFen === START_FEN).toBe(false);
  });

  it("rejects a genuinely malformed FEN without a notice", () => {
    let result!: ReturnType<typeof session.importFen>;
    act(() => {
      result = session.importFen("banana");
    });
    expect(result.ok).toBe(false);
  });
});
