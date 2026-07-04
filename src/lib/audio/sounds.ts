import { readGameSettings } from "@/hooks/useGameSettings";
import type { SettingKey } from "@/lib/settings/schema";

/**
 * ChessOX sound engine — all game audio is synthesised locally with the Web Audio
 * API. No files are downloaded and nothing is hotlinked; each cue is a short
 * envelope of oscillators, so it's a few bytes of code and works offline.
 *
 * Every cue is gated by the unified settings: the master `sound_master` switch,
 * the per-cue toggle, and the `sound_volume` slider.
 */

export type GameSound =
  | "move"
  | "capture"
  | "check"
  | "checkmate"
  | "draw"
  | "victory"
  | "defeat"
  | "notify"
  | "lowtime"
  | "tick";

// Which per-cue setting toggle guards each sound.
const GUARD: Record<GameSound, SettingKey> = {
  move: "move_sound",
  capture: "capture_sound",
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

type Tone = { freq: number; start: number; dur: number; type?: OscillatorType; gain?: number };

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

// Note envelopes per cue. Kept short and distinct so they read at a glance.
const RECIPES: Record<GameSound, Tone[]> = {
  move: [{ freq: 320, start: 0, dur: 0.09, type: "triangle", gain: 0.5 }],
  capture: [
    { freq: 200, start: 0, dur: 0.11, type: "square", gain: 0.4 },
    { freq: 140, start: 0.02, dur: 0.12, type: "triangle", gain: 0.4 },
  ],
  check: [
    { freq: 660, start: 0, dur: 0.1, type: "sine", gain: 0.5 },
    { freq: 880, start: 0.06, dur: 0.12, type: "sine", gain: 0.45 },
  ],
  checkmate: [
    { freq: 523, start: 0, dur: 0.14, gain: 0.5 },
    { freq: 392, start: 0.12, dur: 0.16, gain: 0.5 },
    { freq: 262, start: 0.28, dur: 0.28, gain: 0.5 },
  ],
  draw: [
    { freq: 440, start: 0, dur: 0.16, type: "sine", gain: 0.4 },
    { freq: 440, start: 0.18, dur: 0.16, type: "sine", gain: 0.35 },
  ],
  victory: [
    { freq: 523, start: 0, dur: 0.14, gain: 0.5 },
    { freq: 659, start: 0.14, dur: 0.14, gain: 0.5 },
    { freq: 784, start: 0.28, dur: 0.14, gain: 0.5 },
    { freq: 1047, start: 0.42, dur: 0.3, gain: 0.5 },
  ],
  defeat: [
    { freq: 440, start: 0, dur: 0.16, type: "sawtooth", gain: 0.4 },
    { freq: 349, start: 0.16, dur: 0.18, type: "sawtooth", gain: 0.4 },
    { freq: 262, start: 0.34, dur: 0.34, type: "sawtooth", gain: 0.4 },
  ],
  notify: [
    { freq: 880, start: 0, dur: 0.09, gain: 0.4 },
    { freq: 1175, start: 0.09, dur: 0.12, gain: 0.4 },
  ],
  lowtime: [
    { freq: 988, start: 0, dur: 0.1, type: "square", gain: 0.4 },
    { freq: 988, start: 0.14, dur: 0.1, type: "square", gain: 0.4 },
  ],
  tick: [{ freq: 1200, start: 0, dur: 0.05, type: "square", gain: 0.35 }],
};

/**
 * Play a game cue if the user's settings permit it. Safe to call anywhere; it
 * no-ops on the server, when sound is disabled, or when audio is unavailable.
 */
export function playGameSound(sound: GameSound) {
  const s = readGameSettings();
  if (!s.sound_master) return;
  if (!s[GUARD[sound]]) return;
  const volume = Math.max(0, Math.min(100, s.sound_volume)) / 100;
  if (volume <= 0) return;
  render(RECIPES[sound], volume * 0.5);
}

/** Prime the AudioContext from a user gesture (call once on first interaction). */
export function unlockAudio() {
  audio();
}
