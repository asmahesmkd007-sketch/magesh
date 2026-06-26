import { describe, it, expect } from "vitest";
import { dateInDays, relativeLabel } from "./dates";

describe("dateInDays", () => {
  it("offsets from today", () => {
    const today = new Date();
    const inThree = dateInDays(3);
    const diffDays = Math.round((inThree.getTime() - today.getTime()) / 86_400_000);
    expect(diffDays).toBe(3);
  });
});

describe("relativeLabel", () => {
  it("labels the present and future", () => {
    expect(relativeLabel(0)).toBe("Today");
    expect(relativeLabel(1)).toBe("Tomorrow");
    expect(relativeLabel(5)).toBe("In 5 days");
  });

  it("labels the past", () => {
    expect(relativeLabel(-2)).toBe("2 days ago");
  });
});
