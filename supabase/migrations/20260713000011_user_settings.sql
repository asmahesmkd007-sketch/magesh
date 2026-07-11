-- =====================================================================
-- MIGRATION 20260713000011: USER_SETTINGS TABLE
-- =====================================================================
-- Fixes AUDIT_REPORT.md MEDIUM finding #6. src/lib/settings/settings-sync.ts
-- upserts/reads public.user_settings — one typed column per key in
-- src/lib/settings/schema.ts (SETTING_KEYS), no JSON blob, so this table's
-- columns mirror GameSettings exactly. Column set intentionally matches
-- schema.ts's DEFAULTS object so persistSettingsToDb()/loadSettingsFromDb()
-- work unmodified.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Board
  board_theme TEXT NOT NULL DEFAULT 'royal',
  piece_theme TEXT NOT NULL DEFAULT 'classic',
  show_coordinates BOOLEAN NOT NULL DEFAULT true,
  board_animation BOOLEAN NOT NULL DEFAULT true,
  auto_flip BOOLEAN NOT NULL DEFAULT false,
  show_legal_moves BOOLEAN NOT NULL DEFAULT true,
  show_last_move BOOLEAN NOT NULL DEFAULT true,
  show_move_arrows BOOLEAN NOT NULL DEFAULT true,
  show_move_highlights BOOLEAN NOT NULL DEFAULT true,
  show_check_highlight BOOLEAN NOT NULL DEFAULT true,
  show_threat_squares BOOLEAN NOT NULL DEFAULT false,
  show_captured_pieces BOOLEAN NOT NULL DEFAULT true,
  show_material_difference BOOLEAN NOT NULL DEFAULT true,
  piece_drag_style TEXT NOT NULL DEFAULT 'smooth',
  move_method TEXT NOT NULL DEFAULT 'both',
  board_size TEXT NOT NULL DEFAULT 'medium',
  board_zoom INT NOT NULL DEFAULT 100,
  snap_to_square BOOLEAN NOT NULL DEFAULT true,

  -- Gameplay
  confirm_move BOOLEAN NOT NULL DEFAULT false,
  confirm_resign BOOLEAN NOT NULL DEFAULT true,
  confirm_draw_offer BOOLEAN NOT NULL DEFAULT true,
  auto_queen BOOLEAN NOT NULL DEFAULT false,
  premoves BOOLEAN NOT NULL DEFAULT true,
  multiple_premoves BOOLEAN NOT NULL DEFAULT false,
  enable_takebacks BOOLEAN NOT NULL DEFAULT false,
  auto_focus_board BOOLEAN NOT NULL DEFAULT true,
  auto_reconnect BOOLEAN NOT NULL DEFAULT true,

  -- Clock
  clock_sound BOOLEAN NOT NULL DEFAULT true,
  low_time_warning BOOLEAN NOT NULL DEFAULT true,
  countdown_beep BOOLEAN NOT NULL DEFAULT true,
  clock_position TEXT NOT NULL DEFAULT 'side',
  show_tenths BOOLEAN NOT NULL DEFAULT true,
  time_pressure_effects BOOLEAN NOT NULL DEFAULT true,

  -- Sound
  sound_master BOOLEAN NOT NULL DEFAULT true,
  move_sound BOOLEAN NOT NULL DEFAULT true,
  capture_sound BOOLEAN NOT NULL DEFAULT true,
  check_sound BOOLEAN NOT NULL DEFAULT true,
  checkmate_sound BOOLEAN NOT NULL DEFAULT true,
  draw_sound BOOLEAN NOT NULL DEFAULT true,
  victory_sound BOOLEAN NOT NULL DEFAULT true,
  defeat_sound BOOLEAN NOT NULL DEFAULT true,
  notify_sound BOOLEAN NOT NULL DEFAULT true,
  sound_volume INT NOT NULL DEFAULT 70,
  move_sound_theme TEXT NOT NULL DEFAULT 'classic_wood',

  -- Analysis
  engine_depth INT NOT NULL DEFAULT 15,
  show_best_move BOOLEAN NOT NULL DEFAULT true,
  show_eval_bar BOOLEAN NOT NULL DEFAULT true,
  show_engine_lines BOOLEAN NOT NULL DEFAULT true,
  multi_pv INT NOT NULL DEFAULT 1,
  auto_analysis BOOLEAN NOT NULL DEFAULT true,
  show_opening_name BOOLEAN NOT NULL DEFAULT true,
  show_accuracy BOOLEAN NOT NULL DEFAULT true,
  show_mistakes BOOLEAN NOT NULL DEFAULT true,
  show_blunders BOOLEAN NOT NULL DEFAULT true,
  show_brilliant BOOLEAN NOT NULL DEFAULT true,

  -- Multiplayer
  allow_spectators BOOLEAN NOT NULL DEFAULT true,
  show_spectator_count BOOLEAN NOT NULL DEFAULT true,
  allow_chat BOOLEAN NOT NULL DEFAULT true,
  friend_requests BOOLEAN NOT NULL DEFAULT true,
  match_requests BOOLEAN NOT NULL DEFAULT true,
  tournament_invites BOOLEAN NOT NULL DEFAULT true,
  auto_accept_friend_challenges BOOLEAN NOT NULL DEFAULT false,
  public_profile BOOLEAN NOT NULL DEFAULT true,

  -- Notifications
  notify_match_found BOOLEAN NOT NULL DEFAULT true,
  notify_tournament_starting BOOLEAN NOT NULL DEFAULT true,
  notify_friend_online BOOLEAN NOT NULL DEFAULT true,
  notify_challenge_received BOOLEAN NOT NULL DEFAULT true,
  notify_wallet BOOLEAN NOT NULL DEFAULT true,
  notify_withdrawal BOOLEAN NOT NULL DEFAULT true,
  notify_community BOOLEAN NOT NULL DEFAULT true,
  notify_admin BOOLEAN NOT NULL DEFAULT true,

  -- Accessibility
  high_contrast BOOLEAN NOT NULL DEFAULT false,
  large_pieces BOOLEAN NOT NULL DEFAULT false,
  large_coordinates BOOLEAN NOT NULL DEFAULT false,
  keyboard_navigation BOOLEAN NOT NULL DEFAULT true,
  screen_reader BOOLEAN NOT NULL DEFAULT true,
  reduced_motion BOOLEAN NOT NULL DEFAULT false,
  color_blind_mode TEXT NOT NULL DEFAULT 'none',

  -- Performance
  fps_mode TEXT NOT NULL DEFAULT 'auto',
  graphics_mode TEXT NOT NULL DEFAULT 'balanced',
  asset_preloading BOOLEAN NOT NULL DEFAULT true,
  realtime_optimization BOOLEAN NOT NULL DEFAULT true,

  -- Mobile
  vibration_feedback BOOLEAN NOT NULL DEFAULT true,
  touch_move_confirmation BOOLEAN NOT NULL DEFAULT false,
  mobile_board_scaling INT NOT NULL DEFAULT 100,
  mobile_piece_scaling INT NOT NULL DEFAULT 100,
  mobile_gestures BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own settings" ON public.user_settings;
CREATE POLICY "Users select own settings"
  ON public.user_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own settings" ON public.user_settings;
CREATE POLICY "Users insert own settings"
  ON public.user_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own settings" ON public.user_settings;
CREATE POLICY "Users update own settings"
  ON public.user_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
