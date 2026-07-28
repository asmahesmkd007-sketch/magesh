import { useEffect, useRef, useState } from "react";
import { useGameSettings } from "@/hooks/useGameSettings";

const LOW_TIME_MS = 10_000;

function format(ms: number, showTenths: boolean): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = clamped / 1000;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  if (showTenths && clamped < LOW_TIME_MS) {
    const tenths = Math.floor((clamped % 1000) / 100);
    return `${s}.${tenths}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Renders a player's remaining time, honouring `show_tenths` and
 * `time_pressure_effects`. Accepts remaining time in ms even when the
 * caller's underlying clock only ticks in whole seconds (pass
 * `secondsRemaining * 1000`): between the caller's own updates it
 * interpolates locally off wall-clock time purely for smooth display, so
 * the authoritative countdown/flag-fall logic in the caller is never
 * touched by this component.
 */
export function ClockTime({
  ms,
  active,
  className = "",
}: {
  ms: number;
  active: boolean;
  className?: string;
}) {
  const { settings } = useGameSettings();
  const anchor = useRef({ value: ms, at: Date.now() });
  const [, force] = useState(0);

  useEffect(() => {
    anchor.current = { value: ms, at: Date.now() };
  }, [ms]);

  const needsSmoothing = active && settings.show_tenths && ms < LOW_TIME_MS && ms > 0;
  useEffect(() => {
    if (!needsSmoothing) return;
    const id = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [needsSmoothing]);

  const display = needsSmoothing
    ? Math.max(0, anchor.current.value - (Date.now() - anchor.current.at))
    : ms;

  const inPressure = active && settings.time_pressure_effects && ms > 0 && ms < LOW_TIME_MS;

  return (
    <span className={`${className} ${inPressure ? "cx-time-pressure" : ""}`}>
      {format(display, settings.show_tenths)}
    </span>
  );
}
