/**
 * Move Sound Themes — every theme is a distinct Web Audio synthesis "voice",
 * not a sample file. That means: nothing is downloaded, nothing is hotlinked,
 * there is zero decode/network latency, and switching themes is instant with
 * no risk of overlapping playback from a slow-loading asset. This is what
 * lets ChessOX hit <50ms cue latency on every device, including mobile.
 *
 * A voice is a small set of synthesis parameters (waveform, brightness,
 * decay, attack softness, harmonic richness). `buildRecipes` expands a voice
 * into the full per-cue tone table (move / capture / castle / promote /
 * check / checkmate / draw / victory / defeat / notify / low-time / tick),
 * so adding a new theme is one line, not twelve.
 */
export type GameSound =
  | "move"
  | "capture"
  | "castle"
  | "promote"
  | "check"
  | "checkmate"
  | "draw"
  | "victory"
  | "defeat"
  | "notify"
  | "lowtime"
  | "tick";

export type SoundThemeId =
  | "classic_wood"
  | "tournament_wood"
  | "chesscom_style"
  | "lichess_style"
  | "marble_click"
  | "glass_click"
  | "metal_tap"
  | "royal_gold"
  | "modern_soft"
  | "premium_elite"
  | "vintage"
  | "crystal"
  | "carbon"
  | "silent_mode";

export type Tone = {
  freq: number;
  start: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
};
export type ThemeRecipes = Record<GameSound, Tone[]>;

type Voice = {
  label: string;
  description: string;
  wave: OscillatorType;
  /** Multiplies every cue's base frequency — higher = brighter/thinner. */
  brightness: number;
  /** Multiplies every cue's note duration — higher = longer/softer decay. */
  decay: number;
  /** Extra octave-up harmonic layer gain (0 = pure tone, ~0.25–0.4 = shimmery). */
  richness: number;
  /** Silences every cue regardless of the other parameters. */
  silent?: boolean;
};

const VOICES: Record<SoundThemeId, Voice> = {
  classic_wood: {
    label: "Classic Wood",
    description: "The familiar warm knock of a wooden piece meeting the board.",
    wave: "triangle",
    brightness: 1,
    decay: 1,
    richness: 0,
  },
  tournament_wood: {
    label: "Tournament Wood",
    description: "A heavier, resonant knock — like a weighted tournament set.",
    wave: "triangle",
    brightness: 0.82,
    decay: 1.25,
    richness: 0.15,
  },
  chesscom_style: {
    label: "Chess.com Style",
    description: "Crisp, punchy clicks tuned for fast online play.",
    wave: "square",
    brightness: 1.12,
    decay: 0.8,
    richness: 0,
  },
  lichess_style: {
    label: "Lichess Style",
    description: "Clean, minimal, slightly muted — built for focus.",
    wave: "sine",
    brightness: 0.95,
    decay: 0.9,
    richness: 0,
  },
  marble_click: {
    label: "Marble Click",
    description: "A hard, bright click, like stone on stone.",
    wave: "square",
    brightness: 1.35,
    decay: 0.55,
    richness: 0,
  },
  glass_click: {
    label: "Glass Click",
    description: "A thin, ringing chime with a shimmering tail.",
    wave: "sine",
    brightness: 1.5,
    decay: 1.4,
    richness: 0.35,
  },
  metal_tap: {
    label: "Metal Tap",
    description: "A short metallic tap with an edgy overtone.",
    wave: "sawtooth",
    brightness: 1.2,
    decay: 0.7,
    richness: 0.2,
  },
  royal_gold: {
    label: "Royal Gold",
    description: "Rich, regal chords — ChessOX's signature premium voice.",
    wave: "sine",
    brightness: 1,
    decay: 1.35,
    richness: 0.4,
  },
  modern_soft: {
    label: "Modern Soft",
    description: "Rounded, gentle tones with a soft attack — easy on the ear.",
    wave: "sine",
    brightness: 0.88,
    decay: 1.15,
    richness: 0.1,
  },
  premium_elite: {
    label: "Premium Elite",
    description: "Full, layered, cinematic — the most elaborate voice in ChessOX.",
    wave: "sine",
    brightness: 1.05,
    decay: 1.5,
    richness: 0.45,
  },
  vintage: {
    label: "Vintage",
    description: "A dusty, lo-fi tone reminiscent of an old chess clock.",
    wave: "square",
    brightness: 0.7,
    decay: 1.1,
    richness: 0.05,
  },
  crystal: {
    label: "Crystal",
    description: "Bright, icy, and precise — every move rings clean.",
    wave: "sine",
    brightness: 1.65,
    decay: 1.2,
    richness: 0.3,
  },
  carbon: {
    label: "Carbon",
    description: "Dark, understated, and modern — barely-there confirmation.",
    wave: "triangle",
    brightness: 0.75,
    decay: 0.65,
    richness: 0,
  },
  silent_mode: {
    label: "Silent Mode",
    description: "No move sounds at all — for quiet study or streaming.",
    wave: "sine",
    brightness: 1,
    decay: 1,
    richness: 0,
    silent: true,
  },
};

export const SOUND_THEME_ORDER: SoundThemeId[] = [
  "classic_wood",
  "tournament_wood",
  "chesscom_style",
  "lichess_style",
  "marble_click",
  "glass_click",
  "metal_tap",
  "royal_gold",
  "modern_soft",
  "premium_elite",
  "vintage",
  "crystal",
  "carbon",
  "silent_mode",
];

export const SOUND_THEME_LABELS: Record<SoundThemeId, string> = Object.fromEntries(
  SOUND_THEME_ORDER.map((id) => [id, VOICES[id].label]),
) as Record<SoundThemeId, string>;

export const SOUND_THEME_DESCRIPTIONS: Record<SoundThemeId, string> = Object.fromEntries(
  SOUND_THEME_ORDER.map((id) => [id, VOICES[id].description]),
) as Record<SoundThemeId, string>;

export const DEFAULT_SOUND_THEME: SoundThemeId = "classic_wood";

export function isSoundThemeId(v: string): v is SoundThemeId {
  return (SOUND_THEME_ORDER as string[]).includes(v);
}

// Base cue shapes — every theme is this same "score" reinterpreted through its voice.
const BASE: Record<
  GameSound,
  { freq: number; start: number; dur: number; gain?: number; type?: OscillatorType }[]
> = {
  move: [{ freq: 320, start: 0, dur: 0.09, gain: 0.5 }],
  capture: [
    { freq: 200, start: 0, dur: 0.11, gain: 0.4, type: "square" },
    { freq: 140, start: 0.02, dur: 0.12, gain: 0.4 },
  ],
  castle: [
    { freq: 300, start: 0, dur: 0.08, gain: 0.4 },
    { freq: 360, start: 0.09, dur: 0.1, gain: 0.4 },
  ],
  promote: [
    { freq: 440, start: 0, dur: 0.08, gain: 0.4 },
    { freq: 554, start: 0.08, dur: 0.08, gain: 0.4 },
    { freq: 659, start: 0.16, dur: 0.16, gain: 0.5 },
  ],
  check: [
    { freq: 660, start: 0, dur: 0.1, gain: 0.5 },
    { freq: 880, start: 0.06, dur: 0.12, gain: 0.45 },
  ],
  checkmate: [
    { freq: 523, start: 0, dur: 0.14, gain: 0.5 },
    { freq: 392, start: 0.12, dur: 0.16, gain: 0.5 },
    { freq: 262, start: 0.28, dur: 0.28, gain: 0.5 },
  ],
  draw: [
    { freq: 440, start: 0, dur: 0.16, gain: 0.4 },
    { freq: 440, start: 0.18, dur: 0.16, gain: 0.35 },
  ],
  victory: [
    { freq: 523, start: 0, dur: 0.14, gain: 0.5 },
    { freq: 659, start: 0.14, dur: 0.14, gain: 0.5 },
    { freq: 784, start: 0.28, dur: 0.14, gain: 0.5 },
    { freq: 1047, start: 0.42, dur: 0.3, gain: 0.5 },
  ],
  defeat: [
    { freq: 440, start: 0, dur: 0.16, gain: 0.4, type: "sawtooth" },
    { freq: 349, start: 0.16, dur: 0.18, gain: 0.4, type: "sawtooth" },
    { freq: 262, start: 0.34, dur: 0.34, gain: 0.4, type: "sawtooth" },
  ],
  notify: [
    { freq: 880, start: 0, dur: 0.09, gain: 0.4 },
    { freq: 1175, start: 0.09, dur: 0.12, gain: 0.4 },
  ],
  lowtime: [
    { freq: 988, start: 0, dur: 0.1, gain: 0.4, type: "square" },
    { freq: 988, start: 0.14, dur: 0.1, gain: 0.4, type: "square" },
  ],
  tick: [{ freq: 1200, start: 0, dur: 0.05, gain: 0.35, type: "square" }],
};

function buildRecipes(voice: Voice): ThemeRecipes {
  const out = {} as ThemeRecipes;
  for (const cue of Object.keys(BASE) as GameSound[]) {
    if (voice.silent) {
      out[cue] = [];
      continue;
    }
    const tones: Tone[] = [];
    for (const t of BASE[cue]) {
      const type = t.type ?? voice.wave;
      tones.push({
        freq: t.freq * voice.brightness,
        start: t.start,
        dur: t.dur * voice.decay,
        gain: t.gain,
        type,
      });
      if (voice.richness > 0) {
        tones.push({
          freq: t.freq * voice.brightness * 2,
          start: t.start + 0.005,
          dur: t.dur * voice.decay * 0.7,
          gain: (t.gain ?? 1) * voice.richness,
          type: "sine",
        });
      }
    }
    out[cue] = tones;
  }
  return out;
}

/** Precomputed once at module load — cheap (14 themes × 12 cues of plain data). */
export const RECIPES_BY_THEME: Record<SoundThemeId, ThemeRecipes> = Object.fromEntries(
  SOUND_THEME_ORDER.map((id) => [id, buildRecipes(VOICES[id])]),
) as Record<SoundThemeId, ThemeRecipes>;
