// =====================================================================
// SearchableSelect — accessible, keyboard-driven combobox
// ---------------------------------------------------------------------
// A native <select> cannot be typed into and cannot show a flag beside
// an option; a plain text input cannot constrain the answer to a known
// list. This is the WAI-ARIA "combobox with listbox popup" pattern:
//
//   • type to filter          • ↑/↓ to move, Home/End to jump
//   • Enter selects           • Esc closes and restores the selection
//   • Tab commits and leaves  • click outside closes
//
// The popup is scrollable and the active option is always scrolled into
// view, so a 249-country list stays usable from the keyboard alone.
//
// Filtering ranks prefix matches above substring matches, so typing
// "ind" offers India before British Indian Ocean Territory, and also
// matches `keywords` (the country code) so "IN" finds India too.
// =====================================================================
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { filterOptions, type SelectOption } from "./selectFiltering";

export type { SelectOption };

type Props = {
  options: readonly SelectOption[];
  value: string | null;
  onChange: (option: SelectOption | null) => void;
  placeholder?: string;
  /** Accessible name. Point at a visible <label> with `labelledBy` instead where possible. */
  ariaLabel?: string;
  labelledBy?: string;
  disabled?: boolean;
  /** Marks the input required for form validation messaging. */
  required?: boolean;
  /** Shows an ✕ that clears the selection. */
  clearable?: boolean;
  emptyMessage?: string;
  className?: string;
  inputClassName?: string;
  /** Rendered inside the field on the left (an icon, typically). */
  adornment?: React.ReactNode;
  id?: string;
  name?: string;
  invalid?: boolean;
};

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search…",
  ariaLabel,
  labelledBy,
  disabled,
  required,
  clearable,
  emptyMessage = "No matches found",
  className,
  inputClassName,
  adornment,
  id,
  name,
  invalid,
}: Props) {
  const reactId = useId();
  const inputId = id ?? `combobox-${reactId}`;
  const listId = `${inputId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  // While closed the field shows the selection; while open it shows what
  // is being typed, so the list and the text always agree.
  const displayValue = open ? query : selected ? selected.label : "";

  const filtered = useMemo(
    () => (open ? filterOptions(options, query) : options),
    [open, options, query],
  );

  // A shrinking filter must never leave the highlight past the last row.
  useEffect(() => {
    if (!open) return;
    if (activeIndex > filtered.length - 1) {
      setActiveIndex(filtered.length > 0 ? filtered.length - 1 : 0);
    }
  }, [open, filtered, activeIndex]);

  // Scroll the highlighted row into the scrollable popup.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const node = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  // Click (or focus) outside closes without changing the selection.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  function openPopup(seedQuery = "") {
    if (disabled) return;
    setQuery(seedQuery);
    // Open on the current selection so ↓ continues from where the player
    // already is, not from the top of 249 countries.
    const index = seedQuery ? 0 : selected ? Math.max(0, options.indexOf(selected)) : 0;
    setActiveIndex(index);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  function commit(option: SelectOption | undefined | null) {
    if (!option) return;
    onChange(option);
    close();
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openPopup();
        return;
      }
      // Enter must stay available to submit the surrounding form.
      if (event.key === "Enter" || event.key === "Tab" || event.key === "Escape") return;
      // The field is readOnly while closed, so typing cannot append to
      // the selected label — seed a fresh query with the key instead.
      if (event.key === "Backspace") {
        event.preventDefault();
        openPopup();
        return;
      }
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        openPopup(event.key);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) =>
          filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length,
        );
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(Math.max(0, filtered.length - 1));
        break;
      case "PageDown":
        event.preventDefault();
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 8));
        break;
      case "PageUp":
        event.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 8));
        break;
      case "Enter":
        // Only swallow Enter when it is choosing something — otherwise
        // the surrounding form should still submit.
        if (filtered.length > 0) {
          event.preventDefault();
          commit(filtered[activeIndex]);
        }
        break;
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        close();
        break;
      default:
        break;
    }
  }

  const activeOptionId = open && filtered.length > 0 ? `${inputId}-opt-${activeIndex}` : undefined;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        {adornment && (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40">
            {adornment}
          </div>
        )}
        {!adornment && open && (
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
        )}
        {!adornment && !open && selected?.prefix && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base leading-none"
          >
            {selected.prefix}
          </span>
        )}

        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          role="combobox"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          data-lpignore="true"
          data-form-type="other"
          spellCheck={false}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          aria-required={required}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          // Closed, the field is a value display, not a text box: readOnly
          // keeps a keystroke or a paste from appending to the selection.
          readOnly={!open}
          value={displayValue}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          onMouseDown={() => {
            if (!open) openPopup();
          }}
          onBlur={(e) => {
            // Blur into our own popup (clicking an option) is not a leave.
            if (rootRef.current?.contains(e.relatedTarget as Node)) return;
            if (open) close();
          }}
          className={cn(
            "w-full rounded-xl border bg-black/40 py-2.5 pr-14 text-xs text-ivory outline-none transition-colors placeholder:text-foreground/30 focus:border-gold/40 focus:ring-1 focus:ring-gold/40 disabled:cursor-not-allowed disabled:opacity-50",
            adornment || open || selected?.prefix ? "pl-9" : "pl-3",
            invalid ? "border-destructive/60" : "border-gold/15",
            inputClassName,
          )}
        />

        {clearable && selected && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear selection"
            onClick={() => {
              onChange(null);
              close();
              inputRef.current?.focus();
            }}
            className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-1 text-foreground/40 transition-colors hover:text-gold"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Close list" : "Open list"}
          disabled={disabled}
          onMouseDown={(e) => {
            // Keep focus on the input so the popup keeps its keyboard contract.
            e.preventDefault();
            if (open) close();
            else {
              openPopup();
              inputRef.current?.focus();
            }
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-foreground/40 transition-colors hover:text-gold disabled:opacity-40"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto overscroll-contain rounded-xl border border-gold/20 bg-[#140808] py-1 shadow-2xl shadow-black/60"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2.5 text-xs text-foreground/50">{emptyMessage}</li>
          )}
          {filtered.map((option, index) => {
            const isActive = index === activeIndex;
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${inputId}-opt-${index}`}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                // mousedown, not click: the input's blur would otherwise
                // close the popup before the click ever lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(option);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-xs transition-colors",
                  isActive ? "bg-gold/15 text-ivory" : "text-foreground/80",
                )}
              >
                {option.prefix && (
                  <span aria-hidden="true" className="w-5 shrink-0 text-base leading-none">
                    {option.prefix}
                  </span>
                )}
                <span className="flex-1 truncate">{option.label}</span>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-gold" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
