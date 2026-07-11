import { readGameSettings } from "@/hooks/useGameSettings";
import type { SettingKey } from "@/lib/settings/schema";
import {
  RECIPES_BY_THEME,
  DEFAULT_SOUND_THEME,
  type GameSound,
  type SoundThemeId,
  type Tone,
} from "./soundThemes";

export type { GameSound } from "./soundThemes";

/**
 * ChessOX sound engine — all game audio is synthesised locally with the Web Audio
 * API. No files are downloaded and nothing is hotlinked; each cue is a short
 * envelope of oscillators, so it's a few bytes of code, works offline, and has
 * no load latency at all (there is nothing to load).
 *
 * Every cue is gated by the unified settings: the master `sound_master` switch,
 * the per-cue toggle, and the `sound_volume` slider. Which *voice* plays is
 * chosen by `move_sound_theme` (see soundThemes.ts) — 14 selectable themes.
 */

// Which per-cue setting toggle guards each sound.
const GUARD: Record<GameSound, SettingKey> = {
  move: "move_sound",
  capture: "capture_sound",
  castle: "move_sound",
  promote: "move_sound",
  check: "check_sound",
  checkmate: "checkmate_sound",
  draw: "draw_sound",
  victory: "victory_sound",
  defeat: "defeat_sound",
  notify: "notify_sound",
  lowtime: "low_time_warning",
  tick: "countdown_beep",
};

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Autoplay policies suspend the context until a gesture — resume on demand.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function render(tones: Tone[], masterGain: number) {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  for (const t of tones) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = t.type ?? "sine";
    osc.frequency.value = t.freq;
    const peak = (t.gain ?? 1) * masterGain;
    const s = now + t.start;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), s + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, s + t.dur);
    osc.connect(g).connect(ac.destination);
    osc.start(s);
    osc.stop(s + t.dur + 0.02);
  }
}

function recipesFor(theme: string): Record<GameSound, Tone[]> {
  return RECIPES_BY_THEME[theme as SoundThemeId] ?? RECIPES_BY_THEME[DEFAULT_SOUND_THEME];
}

/**
 * Play a game cue if the user's settings permit it. Safe to call anywhere; it
 * no-ops on the server, when sound is disabled, or when audio is unavailable.
 */
const lastPlayed: Partial<Record<GameSound, number>> = {};

export function playGameSound(sound: GameSound) {
  const now = Date.now();
  if (lastPlayed[sound] && now - lastPlayed[sound]! < 50) return; // Prevent overlap/double-fire
  lastPlayed[sound] = now;

  const s = readGameSettings();
  if (!s.sound_master) return;
  if (!s[GUARD[sound]]) return;
  const volume = Math.max(0, Math.min(100, s.sound_volume)) / 100;
  if (volume <= 0) return;
  const recipes = recipesFor(s.move_sound_theme);
  if (!recipes[sound]) return;
  render(recipes[sound], volume * 0.5);
}

/**
 * Play a short two-note taste of a theme (move, then capture) regardless of
 * the user's current sound settings — used by the theme-picker Preview
 * button so users can audition themes even with sound muted or a specific
 * cue disabled. Plays instantly; no settings are read or written.
 */
export function previewSoundTheme(theme: SoundThemeId) {
  const recipes = recipesFor(theme);
  render(recipes.move, 0.5);
  const ac = audio();
  if (!ac) return;
  window.setTimeout(() => render(recipes.capture, 0.5), 220);
}

/** Minimal shape of a chess.js Move needed to pick the right cue. */
type MoveLike = { captured?: unknown; flags?: string };
type GameLike = { isCheckmate: () => boolean; inCheck: () => boolean };

/**
 * Centralised "which cue fits this move" logic, shared by every surface that
 * plays move audio (live games, puzzles, analysis/replay navigation) so
 * castle/promote/check/checkmate are never forgotten in one place and missed
 * in another.
 */
export function soundForChessMove(move: MoveLike, game: GameLike) {
  if (game.isCheckmate()) return playGameSound("checkmate");
  if (game.inCheck()) return playGameSound("check");
  if (move.flags?.includes("k") || move.flags?.includes("q")) return playGameSound("castle");
  if (move.flags?.includes("p")) return playGameSound("promote");
  if (move.captured) return playGameSound("capture");
  return playGameSound("move");
}

/** Prime the AudioContext from a user gesture (call once on first interaction). */
export function unlockAudio() {
  audio();
}
