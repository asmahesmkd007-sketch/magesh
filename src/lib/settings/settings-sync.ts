import { readGameSettings, writeGameSettings } from "@/hooks/useGameSettings";
import { normalizeSettings, SETTING_KEYS, type GameSettings } from "@/lib/settings/schema";

/**
 * Persistence for the unified settings store against the structured
 * `public.user_settings` table (one typed column per setting — no JSON blobs).
 *
 * localStorage stays the fast source of truth; these helpers mirror it to the DB
 * so settings sync across devices. All calls are best-effort — a missing table or
 * network error never blocks the UI (the app runs fully on the local cache).
 *
 * The client is loosely typed here because `user_settings` is intentionally kept
 * out of the hand-maintained generated types; the column set is validated by the
 * schema instead.
 */

type LooseClient = {
  from: (t: string) => {
    upsert: (
      v: Record<string, unknown>,
      o?: Record<string, unknown>,
    ) => Promise<{ error: unknown }>;
    select: (c: string) => {
      eq: (
        c: string,
        v: string,
      ) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
    };
  };
};

async function client(): Promise<{ db: LooseClient; userId: string } | null> {
  const { supabase } = await import("@/integrations/supabase/client");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { db: supabase as unknown as LooseClient, userId: user.id };
}

/** Only keep keys that are real settings columns — guards against stray fields. */
function pickColumns(patch: Partial<GameSettings>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    if (patch[key] !== undefined) out[key] = patch[key];
  }
  return out;
}

/** Upsert the changed settings for the signed-in user. */
export async function persistSettingsToDb(patch: Partial<GameSettings>): Promise<void> {
  const cols = pickColumns(patch);
  if (Object.keys(cols).length === 0) return;
  const ctx = await client();
  if (!ctx) return;
  await ctx.db
    .from("user_settings")
    .upsert({ user_id: ctx.userId, ...cols }, { onConflict: "user_id" });
}

/** Push the entire local settings object (used after a bulk reset). */
export async function persistAllSettingsToDb(settings: GameSettings): Promise<void> {
  await persistSettingsToDb(settings);
}

/** Pull the stored row and apply it locally if it differs from the cache. */
export async function loadSettingsFromDb(userId: string): Promise<void> {
  const { supabase } = await import("@/integrations/supabase/client");
  const db = supabase as unknown as LooseClient;
  const { data } = await db.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return;
  const remote = normalizeSettings(data);
  const current = readGameSettings();
  // Only write (and re-render) if something actually changed.
  const changed = SETTING_KEYS.some((k) => remote[k] !== current[k]);
  if (changed) writeGameSettings(normalizeSettings({ ...current, ...data }));
}

/** Convenience for the root shell: sync from whoever is currently signed in. */
export async function loadSettingsOnce(): Promise<void> {
  const ctx = await client();
  if (ctx) await loadSettingsFromDb(ctx.userId);
}
