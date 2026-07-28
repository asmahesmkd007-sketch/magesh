import type { BoardTheme, PieceTheme } from "@/hooks/useBoardSettings";
import type { SoundThemeId } from "@/lib/audio/soundThemes";

/**
 * ChessOX Game Settings — single source of truth.
 *
 * DEFAULTS defines every setting key, its value type, and its default. The DB
 * `user_settings` table has one structured column per key (no JSON blobs), the
 * localStorage cache stores the same shape, and the settings UI is generated
 * from SETTINGS_META below — so keys can never drift between layers.
 *
 * `status` documents whether a setting is wired to a live surface today
 * ("wired") or persisted-and-synced but activates when its feature ships
 * ("pending"). This is surfaced honestly in the UI.
 */

export type GameSettings = {
  // ── Board ──
  board_theme: BoardTheme;
  piece_theme: PieceTheme;
  show_coordinates: boolean;
  board_animation: boolean;
  auto_flip: boolean;
  show_legal_moves: boolean;
  show_last_move: boolean;
  show_move_arrows: boolean;
  show_move_highlights: boolean;
  show_check_highlight: boolean;
  show_threat_squares: boolean;
  show_captured_pieces: boolean;
  show_material_difference: boolean;
  piece_drag_style: "smooth" | "instant";
  move_method: "both" | "drag" | "click";
  board_size: "small" | "medium" | "large";
  board_zoom: number; // 80–120 (%)
  snap_to_square: boolean;

  // ── Gameplay ──
  confirm_move: boolean;
  confirm_resign: boolean;
  confirm_draw_offer: boolean;
  auto_queen: boolean;
  premoves: boolean;
  multiple_premoves: boolean;
  enable_takebacks: boolean;
  auto_focus_board: boolean;
  auto_reconnect: boolean;

  // ── Clock ──
  clock_sound: boolean;
  low_time_warning: boolean;
  countdown_beep: boolean;
  clock_position: "side" | "top";
  show_tenths: boolean;
  time_pressure_effects: boolean;

  // ── Sound ──
  sound_master: boolean;
  move_sound: boolean;
  capture_sound: boolean;
  check_sound: boolean;
  checkmate_sound: boolean;
  draw_sound: boolean;
  victory_sound: boolean;
  defeat_sound: boolean;
  notify_sound: boolean;
  sound_volume: number; // 0–100
  move_sound_theme: SoundThemeId;

  // ── Analysis ──
  engine_depth: number; // 5–22
  show_best_move: boolean;
  show_eval_bar: boolean;
  show_engine_lines: boolean;
  multi_pv: number; // 1–5
  auto_analysis: boolean;
  show_opening_name: boolean;
  show_accuracy: boolean;
  show_mistakes: boolean;
  show_blunders: boolean;
  show_brilliant: boolean;

  // ── Multiplayer ──
  allow_spectators: boolean;
  show_spectator_count: boolean;
  allow_chat: boolean;
  friend_requests: boolean;
  match_requests: boolean;
  tournament_invites: boolean;
  auto_accept_friend_challenges: boolean;
  public_profile: boolean;

  // ── Notifications ──
  notify_match_found: boolean;
  notify_tournament_starting: boolean;
  notify_friend_online: boolean;
  notify_challenge_received: boolean;
  notify_wallet: boolean;
  notify_withdrawal: boolean;
  notify_community: boolean;
  notify_admin: boolean;

  // ── Accessibility ──
  high_contrast: boolean;
  large_pieces: boolean;
  large_coordinates: boolean;
  keyboard_navigation: boolean;
  screen_reader: boolean;
  reduced_motion: boolean;
  color_blind_mode: "none" | "deuteranopia" | "protanopia" | "tritanopia";

  // ── Performance ──
  fps_mode: "auto" | "60" | "120";
  graphics_mode: "high" | "balanced" | "low";
  asset_preloading: boolean;
  realtime_optimization: boolean;

  // ── Mobile ──
  vibration_feedback: boolean;
  touch_move_confirmation: boolean;
  mobile_board_scaling: number; // 80–120 (%)
  mobile_piece_scaling: number; // 80–120 (%)
  mobile_gestures: boolean;
};

export const DEFAULTS: GameSettings = {
  board_theme: "royal",
  piece_theme: "classic",
  show_coordinates: true,
  board_animation: true,
  auto_flip: false,
  show_legal_moves: true,
  show_last_move: true,
  show_move_arrows: true,
  show_move_highlights: true,
  show_check_highlight: true,
  show_threat_squares: false,
  show_captured_pieces: true,
  show_material_difference: true,
  piece_drag_style: "smooth",
  move_method: "both",
  board_size: "medium",
  board_zoom: 100,
  snap_to_square: true,

  confirm_move: false,
  confirm_resign: true,
  confirm_draw_offer: true,
  auto_queen: false,
  premoves: true,
  multiple_premoves: false,
  enable_takebacks: false,
  auto_focus_board: true,
  auto_reconnect: true,

  clock_sound: true,
  low_time_warning: true,
  countdown_beep: true,
  clock_position: "side",
  show_tenths: true,
  time_pressure_effects: true,

  sound_master: true,
  move_sound: true,
  capture_sound: true,
  check_sound: true,
  checkmate_sound: true,
  draw_sound: true,
  victory_sound: true,
  defeat_sound: true,
  notify_sound: true,
  sound_volume: 70,
  move_sound_theme: "classic_wood",

  engine_depth: 15,
  show_best_move: true,
  show_eval_bar: true,
  show_engine_lines: true,
  multi_pv: 1,
  auto_analysis: true,
  show_opening_name: true,
  show_accuracy: true,
  show_mistakes: true,
  show_blunders: true,
  show_brilliant: true,

  allow_spectators: true,
  show_spectator_count: true,
  allow_chat: true,
  friend_requests: true,
  match_requests: true,
  tournament_invites: true,
  auto_accept_friend_challenges: false,
  public_profile: true,

  notify_match_found: true,
  notify_tournament_starting: true,
  notify_friend_online: true,
  notify_challenge_received: true,
  notify_wallet: true,
  notify_withdrawal: true,
  notify_community: true,
  notify_admin: true,

  high_contrast: false,
  large_pieces: false,
  large_coordinates: false,
  keyboard_navigation: true,
  screen_reader: true,
  reduced_motion: false,
  color_blind_mode: "none",

  fps_mode: "auto",
  graphics_mode: "balanced",
  asset_preloading: true,
  realtime_optimization: true,

  vibration_feedback: true,
  touch_move_confirmation: false,
  mobile_board_scaling: 100,
  mobile_piece_scaling: 100,
  mobile_gestures: true,
};

export type SettingKey = keyof GameSettings;

export type ControlMeta =
  | { control: "toggle" }
  | { control: "slider"; min: number; max: number; step: number; unit?: string }
  | { control: "select"; options: { value: string; label: string }[] };

export type SettingMeta = ControlMeta & {
  key: SettingKey;
  label: string;
  help?: string;
  /** "wired" = affects a live surface now; "pending" = persisted, activates when its feature ships. */
  status: "wired" | "pending";
};

export type SettingsCategory = {
  id: string;
  title: string;
  desc: string;
  items: SettingMeta[];
};

const toggle = (
  key: SettingKey,
  label: string,
  status: "wired" | "pending",
  help?: string,
): SettingMeta => ({ key, label, status, help, control: "toggle" });

/** Category-grouped metadata that drives the Game Settings UI. */
export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "board",
    title: "Board",
    desc: "How the board and pieces look and behave.",
    items: [
      { ...toggle("show_coordinates", "Show coordinates", "wired") },
      { ...toggle("board_animation", "Board animation", "wired", "Slide pieces between squares.") },
      {
        ...toggle("auto_flip", "Auto-flip board", "wired", "Local play: flip to the side to move."),
      },
      { ...toggle("show_legal_moves", "Show legal moves", "wired") },
      { ...toggle("show_last_move", "Show last move", "wired") },
      { ...toggle("show_move_highlights", "Show move highlights", "wired") },
      { ...toggle("show_check_highlight", "Show check highlight", "wired") },
      { ...toggle("show_captured_pieces", "Show captured pieces", "wired") },
      { ...toggle("show_material_difference", "Show material difference", "wired") },
      { ...toggle("show_move_arrows", "Show move arrows", "pending") },
      { ...toggle("show_threat_squares", "Show threat squares", "pending") },
      {
        key: "move_method",
        label: "Move method",
        status: "wired",
        control: "select",
        options: [
          { value: "both", label: "Drag & Click" },
          { value: "drag", label: "Drag only" },
          { value: "click", label: "Click only" },
        ],
      },
      {
        key: "board_size",
        label: "Board size",
        status: "wired",
        control: "select",
        options: [
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" },
          { value: "large", label: "Large" },
        ],
      },
      {
        key: "board_zoom",
        label: "Board zoom",
        status: "wired",
        control: "slider",
        min: 80,
        max: 120,
        step: 5,
        unit: "%",
      },
      {
        ...toggle(
          "snap_to_square",
          "Snap piece to square",
          "wired",
          "Dragged pieces snap to the square centre under the cursor.",
        ),
      },
      {
        key: "piece_drag_style",
        label: "Piece drag style",
        status: "pending",
        control: "select",
        options: [
          { value: "smooth", label: "Smooth" },
          { value: "instant", label: "Instant" },
        ],
      },
    ],
  },
  {
    id: "gameplay",
    title: "Gameplay",
    desc: "Move confirmation, promotion, and match behaviour.",
    items: [
      { ...toggle("confirm_resign", "Confirm resign", "wired") },
      { ...toggle("confirm_draw_offer", "Confirm draw offer", "wired") },
      {
        ...toggle(
          "auto_queen",
          "Auto-queen promotion",
          "wired",
          "Skip the promotion picker and always queen.",
        ),
      },
      { ...toggle("confirm_move", "Confirm move", "pending") },
      { ...toggle("premoves", "Premoves", "pending") },
      { ...toggle("multiple_premoves", "Multiple premoves", "pending") },
      { ...toggle("enable_takebacks", "Enable takebacks (custom games)", "pending") },
      { ...toggle("auto_focus_board", "Auto-focus board", "pending") },
      { ...toggle("auto_reconnect", "Auto reconnect", "pending") },
    ],
  },
  {
    id: "clock",
    title: "Clock",
    desc: "Time display and time-pressure cues.",
    items: [
      { ...toggle("clock_sound", "Clock sound", "wired") },
      { ...toggle("low_time_warning", "Low-time warning", "wired") },
      { ...toggle("countdown_beep", "Countdown beep", "wired") },
      { ...toggle("show_tenths", "Show tenths under 10s", "wired") },
      {
        ...toggle(
          "time_pressure_effects",
          "Time-pressure effects",
          "wired",
          "Pulses the clock red under 10 seconds.",
        ),
      },
      {
        key: "clock_position",
        label: "Clock position",
        status: "pending",
        control: "select",
        options: [
          { value: "side", label: "Side" },
          { value: "top", label: "Top" },
        ],
      },
    ],
  },
  {
    id: "sound",
    title: "Sound",
    desc: "Game audio. Sounds are generated locally — no downloads. Pick a Move Sound Theme below, then Save.",
    items: [
      { ...toggle("sound_master", "Enable sound", "wired") },
      {
        key: "sound_volume",
        label: "Volume",
        status: "wired",
        control: "slider",
        min: 0,
        max: 100,
        step: 5,
        unit: "%",
      },
      { ...toggle("move_sound", "Move", "wired") },
      { ...toggle("capture_sound", "Capture", "wired") },
      { ...toggle("check_sound", "Check", "wired") },
      { ...toggle("checkmate_sound", "Checkmate", "wired") },
      { ...toggle("draw_sound", "Draw", "wired") },
      { ...toggle("victory_sound", "Victory", "wired") },
      { ...toggle("defeat_sound", "Defeat", "wired") },
      { ...toggle("notify_sound", "Notifications", "wired") },
    ],
  },
  {
    id: "analysis",
    title: "Analysis",
    desc: "Engine and post-game review preferences.",
    items: [
      {
        key: "engine_depth",
        label: "Engine depth",
        status: "pending",
        control: "slider",
        min: 5,
        max: 22,
        step: 1,
      },
      {
        key: "multi_pv",
        label: "Multi-PV lines",
        status: "pending",
        control: "slider",
        min: 1,
        max: 5,
        step: 1,
      },
      { ...toggle("show_best_move", "Show best move", "pending") },
      { ...toggle("show_eval_bar", "Show evaluation bar", "pending") },
      { ...toggle("show_engine_lines", "Show engine lines", "pending") },
      { ...toggle("auto_analysis", "Auto-analysis after game", "pending") },
      { ...toggle("show_opening_name", "Show opening name", "pending") },
      { ...toggle("show_accuracy", "Show accuracy score", "pending") },
      { ...toggle("show_mistakes", "Show mistakes", "pending") },
      { ...toggle("show_blunders", "Show blunders", "pending") },
      { ...toggle("show_brilliant", "Show brilliant moves", "pending") },
    ],
  },
  {
    id: "multiplayer",
    title: "Multiplayer",
    desc: "Spectators, chat, and incoming requests.",
    items: [
      { ...toggle("allow_spectators", "Allow spectators", "pending") },
      { ...toggle("show_spectator_count", "Show spectator count", "pending") },
      { ...toggle("allow_chat", "Allow chat", "pending") },
      { ...toggle("friend_requests", "Friend requests", "pending") },
      { ...toggle("match_requests", "Match requests", "pending") },
      { ...toggle("tournament_invites", "Tournament invites", "pending") },
      { ...toggle("auto_accept_friend_challenges", "Auto-accept friend challenges", "pending") },
      { ...toggle("public_profile", "Public profile", "pending") },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    desc: "Which events notify you.",
    items: [
      { ...toggle("notify_match_found", "Match found", "wired") },
      { ...toggle("notify_tournament_starting", "Tournament starting", "wired") },
      { ...toggle("notify_friend_online", "Friend online", "wired") },
      { ...toggle("notify_challenge_received", "Challenge received", "wired") },
      { ...toggle("notify_wallet", "Wallet", "wired") },
      { ...toggle("notify_withdrawal", "Withdrawal", "wired") },
      { ...toggle("notify_community", "Community", "wired") },
      { ...toggle("notify_admin", "Admin", "wired") },
    ],
  },
  {
    id: "accessibility",
    title: "Accessibility",
    desc: "Contrast, motion, sizing, and color-vision support.",
    items: [
      { ...toggle("high_contrast", "High-contrast mode", "wired") },
      { ...toggle("large_pieces", "Large pieces", "wired") },
      { ...toggle("large_coordinates", "Large coordinates", "wired") },
      { ...toggle("reduced_motion", "Reduced motion", "wired") },
      { ...toggle("keyboard_navigation", "Keyboard navigation", "pending") },
      { ...toggle("screen_reader", "Screen-reader support", "pending") },
      {
        key: "color_blind_mode",
        label: "Color-blind mode",
        status: "wired",
        control: "select",
        options: [
          { value: "none", label: "Off" },
          { value: "deuteranopia", label: "Deuteranopia" },
          { value: "protanopia", label: "Protanopia" },
          { value: "tritanopia", label: "Tritanopia" },
        ],
      },
    ],
  },
  {
    id: "performance",
    title: "Performance",
    desc: "Graphics quality and sync tuning.",
    items: [
      {
        key: "graphics_mode",
        label: "Graphics mode",
        status: "wired",
        control: "select",
        options: [
          { value: "high", label: "High" },
          { value: "balanced", label: "Balanced" },
          { value: "low", label: "Low (best performance)" },
        ],
      },
      {
        key: "fps_mode",
        label: "Frame rate",
        status: "pending",
        control: "select",
        options: [
          { value: "auto", label: "Auto" },
          { value: "60", label: "60 FPS" },
          { value: "120", label: "120 FPS" },
        ],
      },
      { ...toggle("asset_preloading", "Asset preloading", "pending") },
      { ...toggle("realtime_optimization", "Realtime sync optimization", "pending") },
    ],
  },
  {
    id: "mobile",
    title: "Mobile",
    desc: "Touch and haptic behaviour on phones.",
    items: [
      { ...toggle("vibration_feedback", "Vibration feedback", "wired") },
      {
        key: "mobile_board_scaling",
        label: "Board scaling",
        status: "wired",
        control: "slider",
        min: 80,
        max: 120,
        step: 5,
        unit: "%",
      },
      { ...toggle("touch_move_confirmation", "Touch move confirmation", "pending") },
      {
        key: "mobile_piece_scaling",
        label: "Piece scaling",
        status: "pending",
        control: "slider",
        min: 80,
        max: 120,
        step: 5,
        unit: "%",
      },
      {
        ...toggle(
          "mobile_gestures",
          "Gesture controls",
          "wired",
          "Swipe left/right on the board to step through moves in Replay.",
        ),
      },
    ],
  },
];

/** All DB column names (= setting keys), for the migration + validation. */
export const SETTING_KEYS = Object.keys(DEFAULTS) as SettingKey[];

/** Coerce an arbitrary partial (localStorage or DB row) into a valid, fully-typed settings object. */
export function normalizeSettings(
  raw: Partial<Record<string, unknown>> | null | undefined,
): GameSettings {
  const out = { ...DEFAULTS };
  if (!raw) return out;
  for (const key of SETTING_KEYS) {
    const v = raw[key];
    if (v === undefined || v === null) continue;
    const def = DEFAULTS[key];
    if (typeof def === "boolean") {
      if (typeof v === "boolean") (out[key] as boolean) = v;
    } else if (typeof def === "number") {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) (out[key] as number) = clampForKey(key, n);
    } else if (typeof def === "string") {
      if (typeof v === "string" && isAllowedString(key, v)) (out[key] as string) = v;
    }
  }
  return out;
}

function clampForKey(key: SettingKey, n: number): number {
  for (const cat of SETTINGS_CATEGORIES) {
    for (const item of cat.items) {
      if (item.key === key && item.control === "slider") {
        return Math.min(item.max, Math.max(item.min, Math.round(n)));
      }
    }
  }
  return n;
}

function isAllowedString(key: SettingKey, v: string): boolean {
  // board_theme / piece_theme / move_sound_theme are validated by their own
  // registries downstream; accept any non-empty string here and let the
  // consuming module (useBoardSettings / soundThemes) fall back safely.
  if (key === "board_theme" || key === "piece_theme" || key === "move_sound_theme")
    return v.length > 0;
  for (const cat of SETTINGS_CATEGORIES) {
    for (const item of cat.items) {
      if (item.key === key && item.control === "select") {
        return item.options.some((o) => o.value === v);
      }
    }
  }
  return true;
}
