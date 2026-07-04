import { readGameSettings } from "@/hooks/useGameSettings";

/**
 * Fires a short haptic pulse on supporting devices, gated by the
 * `vibration_feedback` setting. No-ops on desktop / unsupported browsers.
 */
export function buzz(pattern: number | number[] = 12) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (!readGameSettings().vibration_feedback) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* vibrate can throw in some embedded webviews — ignore */
  }
}
