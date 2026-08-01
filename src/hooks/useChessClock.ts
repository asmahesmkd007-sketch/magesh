// =====================================================================
// useChessClock — render a ClockState without letting render own the time
// ---------------------------------------------------------------------
// The clock itself (lib/chess/clock.ts) is pure and wall-clock anchored.
// This hook only decides *when to repaint* it, and reports a flag fall
// exactly once.
//
// Two things it deliberately does not do:
//
//   * It never accumulates. Every repaint recomputes from `Date.now()`,
//     so a missed or late frame changes nothing about the time shown.
//   * It never fires the flag callback from inside a state updater or a
//     render. `onFlag` runs in an effect, once per running turn, which
//     is what keeps React's double-invocation from ending a game twice.
//
// Repaints are scheduled to land just after the next visible digit
// change (`msToNextTick`) rather than on a fixed 100 ms interval, so an
// idle board repaints ~1×/s instead of 10×/s, and only speeds up under
// ten seconds when tenths are actually displayed.
// =====================================================================
import { useEffect, useRef, useState } from "react";

import {
  flagged as flaggedOf,
  msToNextTick,
  remainingMs,
  type ClockColor,
  type ClockState,
} from "@/lib/chess/clock";

export type ClockDisplay = {
  whiteMs: number;
  blackMs: number;
  /** The side that has run out of time, or null. */
  flagged: ClockColor | null;
};

export function useChessClock(
  clock: ClockState,
  options: { showTenths?: boolean; onFlag?: (color: ClockColor) => void } = {},
): ClockDisplay {
  const { showTenths = false, onFlag } = options;
  const [now, setNow] = useState(() => Date.now());

  // Keep the latest callback without making it a scheduling dependency —
  // an inline arrow from the caller would otherwise restart the timer on
  // every render.
  const onFlagRef = useRef(onFlag);
  useEffect(() => {
    onFlagRef.current = onFlag;
  }, [onFlag]);

  const running = clock.running;

  useEffect(() => {
    if (!running || clock.untimed) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (cancelled) return;
      const at = Date.now();
      setNow(at);
      const left = remainingMs(clock, running, at);
      const delay = msToNextTick(left, showTenths);
      if (!Number.isFinite(delay)) return; // flagged — nothing left to repaint
      // +8ms so the timer lands just past the boundary rather than a hair
      // before it, which would render the same digit twice.
      timer = setTimeout(tick, delay + 8);
    };
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clock, running, showTenths]);

  // A stopped clock still needs one repaint so the banked value shows.
  useEffect(() => {
    if (!running) setNow(Date.now());
  }, [running, clock]);

  const whiteMs = remainingMs(clock, "w", now);
  const blackMs = remainingMs(clock, "b", now);
  const flagged = flaggedOf(clock, now);

  // Report the flag from an effect, once per running turn.
  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!flagged) return;
    const token = `${flagged}@${clock.since}`;
    if (reportedRef.current === token) return;
    reportedRef.current = token;
    onFlagRef.current?.(flagged);
  }, [flagged, clock.since]);

  return { whiteMs, blackMs, flagged };
}
