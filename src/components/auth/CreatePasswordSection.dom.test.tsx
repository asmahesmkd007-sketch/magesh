// @vitest-environment jsdom
// =====================================================================
// CreatePasswordSection — the optional password block, through the DOM
// ---------------------------------------------------------------------
// Covers what the screen promises: both fields always visible, live
// rule feedback, a Weak/Medium/Strong meter that cannot outrun the
// checklist, a match check, show/hide, and the warning box wording.
// =====================================================================
import { StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CreatePasswordSection } from "./CreatePasswordSection";

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

/** Wired the way onboarding wires it: controlled from the parent. */
function Harness() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  return (
    <CreatePasswordSection
      password={password}
      onPasswordChange={setPassword}
      confirm={confirm}
      onConfirmChange={setConfirm}
    />
  );
}

function render() {
  act(() => {
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
  });
}

function fields(): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>('input[autocomplete="new-password"]')];
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function text(): string {
  return container.textContent ?? "";
}

describe("CreatePasswordSection", () => {
  it("shows both fields up front, with no checkbox to reveal them", () => {
    render();
    const [password, confirm] = fields();
    expect(password).toBeTruthy();
    expect(confirm).toBeTruthy();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(text()).toContain("Create ChessOX Password");
    expect(text()).toContain("(Optional)");
    expect(text()).toContain(
      "This password allows you to log in using Email + Password in addition to Google Sign-In.",
    );
  });

  it("carries the warning box verbatim, in a friendly tone", () => {
    render();
    expect(text()).toContain(
      "Remember this password carefully. You will need this password whenever you sign in using Email & Password or when changing your password in the future.",
    );
    // Nothing alarming: no warning/danger iconography or wording.
    expect(text()).not.toMatch(/cannot be recovered|lost forever|warning!/i);
  });

  it("stays quiet until the player starts typing", () => {
    render();
    expect(text()).not.toContain("Password strength");
    type(fields()[0], "a");
    expect(text()).toContain("Password strength: Weak");
  });

  it("walks the meter Weak → Medium → Strong", () => {
    render();
    const password = fields()[0];

    type(password, "chess");
    expect(text()).toContain("Password strength: Weak");

    type(password, "Chess0x!"); // 8 chars, every rule met
    expect(text()).toContain("Password strength: Medium");

    type(password, "Chess0x!Rook"); // 12 chars, every rule met
    expect(text()).toContain("Password strength: Strong");
  });

  it("ticks each requirement live as it is satisfied", () => {
    render();
    const password = fields()[0];
    const met = () =>
      [...container.querySelectorAll("li")]
        .filter((li) => li.className.includes("text-emerald-400"))
        .map((li) => (li.textContent ?? "").trim());

    type(password, "chess"); // 5 chars, lowercase only
    expect(met()).toEqual(["One lowercase letter"]);

    type(password, "chessrook"); // now long enough too
    expect(met()).toEqual(["At least 8 characters", "One lowercase letter"]);

    type(password, "Chessrook1"); // + uppercase, + number
    expect(met()).toEqual([
      "At least 8 characters",
      "One uppercase letter",
      "One lowercase letter",
      "One number",
    ]);

    type(password, "Chess0x!Rook");
    expect(met()).toHaveLength(5);
  });

  it("reports mismatch and then match on the confirm field", () => {
    render();
    const [password, confirm] = fields();

    type(password, "Chess0x!Rook");
    type(confirm, "Chess0x!Roo");
    expect(text()).toContain("Passwords do not match.");
    expect(confirm.getAttribute("aria-invalid")).toBe("true");

    type(confirm, "Chess0x!Rook");
    expect(text()).toContain("Passwords match.");
    expect(text()).not.toContain("Passwords do not match.");
    expect(confirm.getAttribute("aria-invalid")).toBeNull();
  });

  it("toggles visibility per field", () => {
    render();
    const [password, confirm] = fields();
    expect(password.type).toBe("password");
    expect(confirm.type).toBe("password");

    const toggles = [...container.querySelectorAll("button")].filter((b) =>
      (b.getAttribute("aria-label") ?? "").toLowerCase().startsWith("show"),
    );
    expect(toggles).toHaveLength(2);

    act(() => toggles[0].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(fields()[0].type).toBe("text");
    // Revealing one field must not reveal the other.
    expect(fields()[1].type).toBe("password");
  });
});
