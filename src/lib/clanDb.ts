import { supabase } from "@/integrations/supabase/client";

/**
 * The generated Supabase types (src/integrations/supabase/types.ts) lag
 * behind supabase/schema.sql for several tables — a known repo-wide gap
 * (see other "migration not yet applied to DB" modules). The clan tables/
 * RPCs (clan_leaderboard, clan_messages, clan_awards, clan_create, etc.)
 * exist in schema.sql but not in the generated types, so `.from()`/`.rpc()`
 * calls need an untyped handle. Runtime behavior is unaffected — only the
 * compile-time schema check is relaxed, scoped to the clan module.
 */
export const clanDb = supabase as any;
