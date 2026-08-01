import { describe, expect, it } from "vitest";

import {
  formatEndReason,
  isDecisive,
  normalizeResult,
  outcomeFor,
  personalHeadline,
  resultFromPgnTag,
  resultHeadline,
  resultSentence,
  resultToPgnTag,
  winnerColor,
  type GameResult,
} from "./result";

const ALL: GameResult[] = ["white", "black", "draw", "ongoing", "aborted"];

describe("normalizeResult", () => {
  it("passes through every enum member", () => {
    for (const r of ALL) expect(normalizeResult(r)).toBe(r);
  });

  it("degrades unknown input to 'ongoing', never to a winner", () => {
    for (const bad of ["", "  ", "1-0", "WHITE_WIN", "black_win", "finished", null, undefined]) {
      const out = normalizeResult(bad as string | null | undefined);
      expect(isDecisive(out)).toBe(false);
    }
  });

  it("is case- and whitespace-tolerant", () => {
    expect(normalizeResult(" White ")).toBe("white");
    expect(normalizeResult("DRAW")).toBe("draw");
  });
});

describe("resultHeadline — the 'only Black Win' regression", () => {
  // The original bug: `result === "white" ? "White" : "Black"` reported a
  // Black win for draw / ongoing / aborted. Only 'black' may ever say so.
  it("names Black as winner for exactly one result", () => {
    const blackWins = ALL.filter((r) => resultHeadline(r) === "Black Wins");
    expect(blackWins).toEqual(["black"]);
  });

  it("names White as winner for exactly one result", () => {
    const whiteWins = ALL.filter((r) => resultHeadline(r) === "White Wins");
    expect(whiteWins).toEqual(["white"]);
  });

  it("gives non-decisive results their own headline", () => {
    expect(resultHeadline("draw")).toBe("Draw");
    expect(resultHeadline("aborted")).toBe("Game Aborted");
    expect(resultHeadline("ongoing")).toBe("In Progress");
  });

  it("never reports a winner for unknown DB values", () => {
    expect(resultHeadline(normalizeResult("something_new"))).toBe("In Progress");
  });
});

describe("winnerColor / isDecisive", () => {
  it("maps only decisive results to a colour", () => {
    expect(winnerColor("white")).toBe("w");
    expect(winnerColor("black")).toBe("b");
    for (const r of ["draw", "ongoing", "aborted"] as GameResult[]) {
      expect(winnerColor(r)).toBeNull();
      expect(isDecisive(r)).toBe(false);
    }
  });
});

describe("outcomeFor", () => {
  it("is symmetric between the two seats", () => {
    expect(outcomeFor("white", "w")).toBe("win");
    expect(outcomeFor("white", "b")).toBe("loss");
    expect(outcomeFor("black", "b")).toBe("win");
    expect(outcomeFor("black", "w")).toBe("loss");
  });

  it("reports a draw to both seats", () => {
    expect(outcomeFor("draw", "w")).toBe("draw");
    expect(outcomeFor("draw", "b")).toBe("draw");
  });

  it("gives spectators no verdict on decisive games", () => {
    expect(outcomeFor("white", null)).toBe("none");
    expect(outcomeFor("black", undefined)).toBe("none");
  });

  it("gives no verdict for aborted/ongoing games", () => {
    expect(outcomeFor("aborted", "w")).toBe("none");
    expect(outcomeFor("ongoing", "b")).toBe("none");
  });
});

describe("personalHeadline", () => {
  it("speaks to the player when they have a seat", () => {
    expect(personalHeadline("white", "w")).toBe("You Won");
    expect(personalHeadline("white", "b")).toBe("You Lost");
    expect(personalHeadline("draw", "w")).toBe("Draw");
  });

  it("falls back to the neutral headline for spectators", () => {
    expect(personalHeadline("white", null)).toBe("White Wins");
    expect(personalHeadline("black", null)).toBe("Black Wins");
    expect(personalHeadline("aborted", "w")).toBe("Game Aborted");
  });
});

describe("PGN result tags", () => {
  it("round-trips decisive and drawn results", () => {
    for (const r of ["white", "black", "draw"] as GameResult[]) {
      expect(resultFromPgnTag(resultToPgnTag(r))).toBe(r);
    }
  });

  it("uses '*' for unfinished/aborted games", () => {
    expect(resultToPgnTag("ongoing")).toBe("*");
    expect(resultToPgnTag("aborted")).toBe("*");
    expect(resultFromPgnTag("*")).toBe("ongoing");
  });
});

describe("formatEndReason", () => {
  it("humanises every reason the server actually writes", () => {
    expect(formatEndReason("checkmate")).toBe("Checkmate");
    expect(formatEndReason("resignation")).toBe("Resignation");
    expect(formatEndReason("black_won_on_time")).toBe("On time");
    expect(formatEndReason("white_won_on_time")).toBe("On time");
    expect(formatEndReason("timeout")).toBe("On time");
    expect(formatEndReason("agreement")).toBe("By agreement");
    expect(formatEndReason("repetition")).toBe("Threefold repetition");
    expect(formatEndReason("insufficient")).toBe("Insufficient material");
    expect(formatEndReason("fifty-move")).toBe("Fifty-move rule");
    expect(formatEndReason("no_show")).toBe("No show");
    expect(formatEndReason("tournament_cancelled")).toBe("Tournament cancelled");
  });

  it("de-snakes unknown reasons instead of dropping them", () => {
    expect(formatEndReason("some_new_reason")).toBe("Some new reason");
  });

  it("returns null when there is no reason", () => {
    expect(formatEndReason(null)).toBeNull();
    expect(formatEndReason(undefined)).toBeNull();
    expect(formatEndReason("")).toBeNull();
  });
});

describe("resultSentence", () => {
  it("reads naturally for each reason shape", () => {
    expect(resultSentence("white", "checkmate")).toBe("White Wins by checkmate");
    expect(resultSentence("black", "black_won_on_time")).toBe("Black Wins on time");
    expect(resultSentence("draw", "agreement")).toBe("Draw by agreement");
    expect(resultSentence("draw", "stalemate")).toBe("Draw by stalemate");
    expect(resultSentence("aborted", "aborted")).toBe("Game Aborted — Aborted");
  });

  it("omits the reason when there isn't one", () => {
    expect(resultSentence("white", null)).toBe("White Wins");
  });
});
