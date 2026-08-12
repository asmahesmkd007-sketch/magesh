// =====================================================================
// OtpInput — six single-character boxes that behave like one field
// ---------------------------------------------------------------------
// Six inputs rather than one give the familiar per-digit affordance, but
// they have to be wired to behave as a single control: typing advances,
// backspace retreats, arrows move, and a pasted code fills the whole row
// from wherever the cursor happens to be.
//
// Laid out as a 6-column grid of full-width cells, so the row scales down
// to the viewport instead of overflowing it on a narrow phone.
// =====================================================================
import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Fired when the sixth digit lands, so the form can submit itself. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  /** Labels the group for assistive tech. */
  ariaLabel?: string;
};

const DIGITS = /\d/g;

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  autoFocus,
  invalid,
  ariaLabel = "Verification code",
}: Props) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  // Guards against re-firing onComplete on every keystroke once full.
  const completed = useRef(false);

  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (value.length === length && !completed.current) {
      completed.current = true;
      onComplete?.(value);
    } else if (value.length < length) {
      completed.current = false;
    }
  }, [value, length, onComplete]);

  const focusBox = (i: number) => {
    const target = boxes.current[Math.max(0, Math.min(length - 1, i))];
    target?.focus();
    target?.select();
  };

  /** Replace one position, keeping the string dense (no holes). */
  const setDigit = (index: number, digit: string) => {
    const next = value.padEnd(index, " ").slice(0, index) + digit + value.slice(index + 1);
    onChange(next.replace(/\s/g, "").slice(0, length));
  };

  const handleChange = (index: number, raw: string) => {
    const digits = raw.match(DIGITS)?.join("") ?? "";
    if (!digits) return;

    // A phone's autofill (or a fast paste into one box) can deliver the
    // whole code to a single input — spread it across the row.
    if (digits.length > 1) {
      onChange(digits.slice(0, length));
      focusBox(Math.min(digits.length, length - 1));
      return;
    }

    setDigit(index, digits);
    if (index < length - 1) focusBox(index + 1);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[index]) {
        // Clear this box first; a second press then steps back.
        onChange((value.slice(0, index) + value.slice(index + 1)).slice(0, length));
      } else if (index > 0) {
        onChange(value.slice(0, index - 1) + value.slice(index));
        focusBox(index - 1);
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(index - 1);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(index + 1);
      return;
    }
    // Everything that is not a digit or an editing key is refused outright,
    // so letters and symbols can never enter the field.
    if (e.key.length === 1 && !/\d/.test(e.key) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").match(DIGITS)?.join("") ?? "";
    if (!digits) return;
    onChange(digits.slice(0, length));
    focusBox(Math.min(digits.length, length - 1));
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`grid w-full gap-1.5 sm:gap-2`}
      style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
    >
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          type="text"
          // numeric keypad on mobile without the spinner/scroll quirks of
          // type="number"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          maxLength={1}
          value={value[i] ?? ""}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.currentTarget.select()}
          className={`aspect-square w-full min-w-0 rounded-lg border bg-white/[0.03] text-center font-display text-lg tabular-nums outline-none transition-colors disabled:opacity-50 sm:text-2xl ${
            invalid
              ? "border-red-500/60 text-red-300"
              : "border-gold/25 text-ivory focus:border-gold/70 focus:bg-white/[0.06]"
          }`}
        />
      ))}
    </div>
  );
}
