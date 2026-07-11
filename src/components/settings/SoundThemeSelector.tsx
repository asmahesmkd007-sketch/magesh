import { useEffect, useState } from "react";
import { Check, Play, Save, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { GoldButton } from "@/components/site/Primitives";
import { useGameSettings } from "@/hooks/useGameSettings";
import { previewSoundTheme } from "@/lib/audio/sounds";
import {
  SOUND_THEME_ORDER,
  SOUND_THEME_LABELS,
  SOUND_THEME_DESCRIPTIONS,
  type SoundThemeId,
} from "@/lib/audio/soundThemes";

const GOLD = "#D4AF37";

/**
 * Move Sound Theme picker — Board Settings → Sound Settings → Move Sound Theme.
 *
 * Deliberately NOT wired like the rest of the schema-driven settings (which
 * apply the instant you touch them): selecting a card here only updates a
 * local draft and plays an instant, un-gated preview. The choice is only
 * written to settings (and synced to `user_settings.move_sound_theme`) when
 * the user presses Save — so browsing themes never surprises anyone mid-game.
 */
export function SoundThemeSelector() {
  const { settings, set } = useGameSettings();
  const [draft, setDraft] = useState<SoundThemeId>(settings.move_sound_theme);
  const [dirty, setDirty] = useState(false);

  // Pick up external changes (DB load on sign-in, Reset to defaults) as long
  // as the user hasn't started picking a different theme locally.
  useEffect(() => {
    if (!dirty) setDraft(settings.move_sound_theme);
  }, [settings.move_sound_theme, dirty]);

  function choose(id: SoundThemeId) {
    setDraft(id);
    setDirty(true);
    previewSoundTheme(id);
  }

  function save() {
    set("move_sound_theme", draft);
    setDirty(false);
    toast.success(`Move sound theme saved — ${SOUND_THEME_LABELS[draft]}`);
  }

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">Move Sound Theme</h3>
        <span className="text-[11px] text-muted-foreground">
          {SOUND_THEME_ORDER.length} themes · synthesised locally, zero downloads
        </span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Preview any theme instantly — nothing changes until you press Save. The saved theme plays
        everywhere: Play vs Player, vs Bot, Tournaments, Puzzles, Analysis, and Replay.
      </p>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {SOUND_THEME_ORDER.map((id) => {
          const selected = draft === id;
          return (
            <div
              key={id}
              className={`relative flex items-start gap-3 rounded-xl border p-3 transition-all duration-200 ${
                selected
                  ? "border-gold bg-gold/10 shadow-[0_8px_28px_-8px_rgba(212,175,55,0.55)]"
                  : "border-white/10 bg-white/[0.03] hover:border-gold/40 hover:bg-white/[0.06]"
              }`}
            >
              <button
                type="button"
                onClick={() => previewSoundTheme(id)}
                aria-label={`Preview ${SOUND_THEME_LABELS[id]}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold transition hover:bg-gold/20"
              >
                {id === "silent_mode" ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Play className="h-3.5 w-3.5 translate-x-[1px]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => choose(id)}
                aria-pressed={selected}
                className="min-w-0 flex-1 text-left"
              >
                <div
                  className={`text-sm font-medium ${selected ? "text-gold" : "text-foreground"}`}
                >
                  {SOUND_THEME_LABELS[id]}
                </div>
                <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {SOUND_THEME_DESCRIPTIONS[id]}
                </div>
              </button>

              {selected && (
                <span
                  className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full shadow-md"
                  style={{ background: GOLD }}
                >
                  <Check className="h-3 w-3 text-[#24364A]" strokeWidth={3.5} />
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {dirty ? (
            <span className="text-gold">Unsaved theme selected — press Save to apply.</span>
          ) : (
            `Currently saved: ${SOUND_THEME_LABELS[settings.move_sound_theme]}`
          )}
        </span>
        <GoldButton onClick={save} disabled={!dirty}>
          <Save className="h-4 w-4" /> Save Settings
        </GoldButton>
      </div>
    </div>
  );
}
