// @vitest-environment jsdom
// =====================================================================
// SearchableSelect — behaviour, driven through the real DOM
// ---------------------------------------------------------------------
// The pure ranking function is covered in SearchableSelect.test.ts.
// This file exercises what a player actually does: click, type, arrow
// around, press Enter — plus the country → state coupling the onboarding
// form depends on (changing country must clear the state and swap the
// list for that country's own).
// =====================================================================
import { StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchableSelect } from "./SearchableSelect";
import type { SelectOption } from "./selectFiltering";
import { COUNTRIES, countryFlag } from "@/data/countries";
import { subdivisionsFor } from "@/data/subdivisions";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const countryOptions: SelectOption[] = COUNTRIES.map((c) => ({
  value: c.code,
  label: c.name,
  prefix: countryFlag(c.code),
  keywords: c.code,
}));

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom implements neither of these; the component calls both.
  Element.prototype.scrollIntoView = () => {};
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

function render(ui: React.ReactNode) {
  act(() => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
}

function combobox(scope: ParentNode = container): HTMLInputElement {
  const node = scope.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (!node) throw new Error("no combobox rendered");
  return node;
}

function listbox(scope: ParentNode = container): HTMLElement | null {
  return scope.querySelector<HTMLElement>('[role="listbox"]');
}

/** Option text with the flag prefix stripped (regional indicator pairs). */
function optionLabels(scope: ParentNode = container): string[] {
  return [...scope.querySelectorAll('[role="option"]')].map(textWithoutFlag);
}

function textWithoutFlag(node: Element | null): string {
  return (node?.textContent ?? "").replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").trim();
}

/** React tracks the input's value internally — go through the native setter. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(input: HTMLElement, key: string) {
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

function open(input: HTMLInputElement) {
  act(() => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
}

describe("SearchableSelect", () => {
  it("starts closed, showing the current selection", () => {
    render(
      <SearchableSelect
        options={countryOptions}
        value="IN"
        onChange={() => {}}
        ariaLabel="Country"
      />,
    );
    const input = combobox();
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.value).toBe("India");
    expect(listbox()).toBeNull();
  });

  it("opens a scrollable listbox with every country", () => {
    render(<SearchableSelect options={countryOptions} value={null} onChange={() => {}} />);
    open(combobox());

    expect(combobox().getAttribute("aria-expanded")).toBe("true");
    expect(optionLabels()).toHaveLength(249);
    // The popup scrolls rather than growing to 249 rows tall.
    expect(listbox()?.className).toContain("max-h-60");
    expect(listbox()?.className).toContain("overflow-y-auto");
    // Flag beside the name, on every row.
    const india = [...container.querySelectorAll('[role="option"]')].find(
      (li) => textWithoutFlag(li) === "India",
    );
    expect(india?.textContent).toContain("\u{1F1EE}\u{1F1F3}");
  });

  it("filters as the player types", () => {
    render(<SearchableSelect options={countryOptions} value={null} onChange={() => {}} />);
    const input = combobox();
    open(input);
    type(input, "ind");

    const labels = optionLabels();
    expect(labels[0]).toBe("India");
    expect(labels).toContain("British Indian Ocean Territory");
    expect(labels).not.toContain("Germany");
  });

  it("shows an empty-state instead of a blank popup", () => {
    render(
      <SearchableSelect
        options={countryOptions}
        value={null}
        onChange={() => {}}
        emptyMessage="No country matches that search"
      />,
    );
    const input = combobox();
    open(input);
    type(input, "atlantis");

    expect(optionLabels()).toEqual([]);
    expect(container.textContent).toContain("No country matches that search");
  });

  it("selects with the keyboard alone: type, arrow, Enter", () => {
    const onChange = vi.fn();
    render(<SearchableSelect options={countryOptions} value={null} onChange={onChange} />);
    const input = combobox();

    // A printable key opens the popup and seeds the query.
    press(input, "c");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    type(input, "can");
    expect(optionLabels()[0]).toBe("Canada");

    press(input, "Enter");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ value: "CA", label: "Canada" });
  });

  it("moves the active option with ArrowDown / ArrowUp / Home / End", () => {
    const onChange = vi.fn();
    render(<SearchableSelect options={countryOptions} value={null} onChange={onChange} />);
    const input = combobox();
    open(input);

    const activeLabel = () => {
      const id = input.getAttribute("aria-activedescendant");
      return id ? textWithoutFlag(document.getElementById(id)) : null;
    };

    const first = activeLabel();
    press(input, "ArrowDown");
    const second = activeLabel();
    expect(second).not.toBe(first);

    press(input, "ArrowUp");
    expect(activeLabel()).toBe(first);

    press(input, "End");
    expect(activeLabel()).toBe(countryOptions[countryOptions.length - 1].label);

    press(input, "Home");
    expect(activeLabel()).toBe(countryOptions[0].label);

    press(input, "Enter");
    expect(onChange.mock.calls[0][0]).toMatchObject({ label: countryOptions[0].label });
  });

  it("closes on Escape without changing the selection", () => {
    const onChange = vi.fn();
    render(<SearchableSelect options={countryOptions} value="IN" onChange={onChange} />);
    const input = combobox();

    open(input);
    type(input, "ger");
    press(input, "Escape");

    expect(listbox()).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("India");
  });

  it("closes when the player clicks elsewhere on the page", () => {
    render(<SearchableSelect options={countryOptions} value={null} onChange={() => {}} />);
    open(combobox());
    expect(listbox()).not.toBeNull();

    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(listbox()).toBeNull();
  });

  it("marks the chosen option as selected for assistive tech", () => {
    render(<SearchableSelect options={countryOptions} value="IN" onChange={() => {}} />);
    open(combobox());
    const selected = [...container.querySelectorAll('[role="option"]')].filter(
      (li) => li.getAttribute("aria-selected") === "true",
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain("India");
  });
});

// ── The country → state contract the onboarding form relies on ───────

function CountryAndState() {
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [state, setState] = useState("");
  const states = subdivisionsFor(countryCode);

  return (
    <div>
      <div data-testid="country">
        <SearchableSelect
          options={countryOptions}
          value={countryCode}
          onChange={(option) => {
            setCountryCode(option?.value ?? null);
            setState(""); // changing country invalidates the state
          }}
          ariaLabel="Country"
        />
      </div>
      <div data-testid="state">
        {states.length > 0 ? (
          <SearchableSelect
            options={states.map((s) => ({ value: s, label: s }))}
            value={state || null}
            onChange={(option) => setState(option?.value ?? "")}
            ariaLabel="State"
          />
        ) : (
          <input aria-label="State" value={state} onChange={(e) => setState(e.target.value)} />
        )}
      </div>
      <output data-testid="value">{`${countryCode ?? ""}|${state}`}</output>
    </div>
  );
}

describe("country → state coupling", () => {
  function pick(testid: string, query: string) {
    const scope = container.querySelector<HTMLElement>(`[data-testid="${testid}"]`)!;
    const input = combobox(scope);
    open(input);
    type(input, query);
    press(input, "Enter");
  }

  const stateScope = () => container.querySelector<HTMLElement>('[data-testid="state"]')!;
  const value = () => container.querySelector('[data-testid="value"]')!.textContent;

  it("loads only the selected country's states", () => {
    render(<CountryAndState />);

    pick("country", "India");
    open(combobox(stateScope()));
    const indian = optionLabels(stateScope());
    expect(indian).toContain("Tamil Nadu");
    expect(indian).toContain("Kerala");
    expect(indian).not.toContain("California");
    expect(indian).not.toContain("Ontario");
    expect(indian).toHaveLength(36);
    press(combobox(stateScope()), "Escape");

    pick("state", "Tamil Nadu");
    expect(value()).toBe("IN|Tamil Nadu");
  });

  it("resets the state the moment the country changes", () => {
    render(<CountryAndState />);
    pick("country", "India");
    pick("state", "Kerala");
    expect(value()).toBe("IN|Kerala");

    pick("country", "Canada");
    expect(value()).toBe("CA|");

    open(combobox(stateScope()));
    const canadian = optionLabels(stateScope());
    expect(canadian).toEqual(expect.arrayContaining(["Ontario", "Alberta", "Quebec"]));
    expect(canadian).not.toContain("Kerala");
  });

  it("falls back to a text field when no states are available", () => {
    render(<CountryAndState />);

    expect(stateScope().querySelector('input[role="combobox"]')).toBeNull();
    const plain = stateScope().querySelector<HTMLInputElement>("input")!;
    expect(plain).not.toBeNull();
    expect(plain.getAttribute("aria-label")).toBe("State");
    expect(plain.readOnly).toBe(false);
  });
});
