import { useEffect } from "react";
import { useGameSettings } from "@/hooks/useGameSettings";
import { unlockAudio } from "@/lib/audio/sounds";

/**
 * Applies global, document-level settings — accessibility and performance — that
 * aren't tied to a single board. Toggles classes / CSS variables on <html> so the
 * effect is instant and reaches every screen (including replay & spectator).
 * Mounted once in the root shell.
 */
export function SettingsEffects() {
  const { settings } = useGameSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("cx-reduced-motion", settings.reduced_motion);
    root.classList.toggle("cx-high-contrast", settings.high_contrast);
    root.classList.toggle("cx-large-coords", settings.large_coordinates);
    root.classList.toggle("cx-graphics-low", settings.graphics_mode === "low");
    root.classList.toggle("cx-graphics-high", settings.graphics_mode === "high");
    for (const m of ["deuteranopia", "protanopia", "tritanopia"]) {
      root.classList.toggle(`cx-cb-${m}`, settings.color_blind_mode === m);
    }
    // Piece/board sizing knobs consumed by InteractiveBoard via CSS vars.
    root.style.setProperty("--cx-piece-scale", settings.large_pieces ? "1.14" : "1");
    root.style.setProperty(
      "--cx-mobile-board-scale",
      String(Math.max(80, Math.min(120, settings.mobile_board_scaling)) / 100),
    );
  }, [
    settings.reduced_motion,
    settings.high_contrast,
    settings.large_coordinates,
    settings.graphics_mode,
    settings.color_blind_mode,
    settings.large_pieces,
    settings.mobile_board_scaling,
  ]);

  // Prime the Web Audio context on the first user gesture so game sounds can play.
  useEffect(() => {
    const prime = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);

  return null;
}
