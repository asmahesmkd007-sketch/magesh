import { useEffect, useRef } from "react";
import { useGameSettings } from "@/hooks/useGameSettings";
import { playGameSound } from "@/lib/audio/sounds";

/** Below this many seconds remaining, low-time cues can fire. */
const LOW_TIME_SECONDS = 10;

/**
 * Centralised low-time clock audio, shared by every clock (Play Online,
 * Play Bot, Local Game, Tournament arena). Plays the low-time warning once
 * per crossing into the last `LOW_TIME_SECONDS`, and a per-second countdown
 * tick while under it — gated by `clock_sound` (the category master) plus
 * the individual `low_time_warning` / `countdown_beep` toggles.
 *
 * Takes whole seconds remaining (not ms) since every clock in the app
 * already ticks in whole seconds server/state-side; sub-second precision is
 * a pure display concern handled separately by `ClockTime`.
 */
export function useClockAudio(secondsRemaining: number, active: boolean) {
  const { settings } = useGameSettings();
  const warnedRef = useRef(false);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !settings.clock_sound || secondsRemaining > LOW_TIME_SECONDS) {
      warnedRef.current = false;
      lastTickRef.current = null;
      return;
    }
    if (secondsRemaining <= 0) return;

    if (!warnedRef.current) {
      warnedRef.current = true;
      if (settings.low_time_warning) playGameSound("lowtime");
    }

    if (settings.countdown_beep && lastTickRef.current !== secondsRemaining) {
      lastTickRef.current = secondsRemaining;
      playGameSound("tick");
    }
  }, [
    secondsRemaining,
    active,
    settings.clock_sound,
    settings.low_time_warning,
    settings.countdown_beep,
  ]);
}
