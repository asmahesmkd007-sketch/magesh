// =====================================================================
// ADMIN SERVICE LAYER (client)
// ---------------------------------------------------------------------
// Every mutation is a SECURITY DEFINER RPC that re-checks the caller's
// admin role server-side and writes to admin_audit_logs. The frontend
// role check (useIsAdmin) only hides the UI — it is never the gate.
// Backend: supabase/migrations/20260701000005_admin_system.sql
// =====================================================================
import { supabase } from "@/integrations/supabase/client";

export type AdminStats = {
  total_users: number;
  online_users: number;
  premium_users: number;
  new_users_today: number;
  total_games: number;
  games_today: number;
  active_matches: number;
  total_tournaments: number;
  upcoming_tournaments: number;
  live_tournaments: number;
  pending_withdrawals: number;
  completed_withdrawals: number;
  reports_pending: number;
  community_posts: number;
  coins_in_system: number;
  locked_coins: number;
  prize_distributed: number;
  entry_fees_collected: number;
  withdrawals_paid: number;
};

export type AdminUser = {
  id: string;
  username: string;
  full_name: string;
  account_status: "active" | "banned" | "suspended" | "muted";
  premium_active: boolean;
  premium_tier: string;
  is_online: boolean;
  last_seen: string | null;
  created_at: string;
  balance: number;
  locked_balance: number;
  role: string;
};

export type AdminAuditLog = {
  id: string;
  admin_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  old_status: string | null;
  new_status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type Rpc = (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const client = supabase as unknown as { rpc: Rpc };
  const { data, error } = await client.rpc(name, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

// ── Role checks ──────────────────────────────────────────────────────
export const checkSuperAdmin = () => rpc<boolean>("is_super_admin");

// ── Dashboard / listings ─────────────────────────────────────────────
export const getDashboardStats = () => rpc<AdminStats>("admin_dashboard_stats");

export const listUsers = (search = "", limit = 50, offset = 0) =>
  rpc<AdminUser[]>("admin_list_users", { p_search: search, p_limit: limit, p_offset: offset });

export async function getAuditLogs(limit = 100): Promise<AdminAuditLog[]> {
  const { data, error } = await supabase
    .from("admin_audit_logs" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminAuditLog[];
}

// ── User management ──────────────────────────────────────────────────
export const setUserStatus = (
  userId: string,
  status: AdminUser["account_status"],
  reason?: string,
  until?: string,
) =>
  rpc<void>("admin_set_user_status", {
    p_user_id: userId,
    p_status: status,
    p_reason: reason ?? null,
    p_until: until ?? null,
  });

export const adjustCoins = (userId: string, amount: number, note?: string) =>
  rpc<number>("admin_adjust_coins", { p_user_id: userId, p_amount: amount, p_note: note ?? null });

export const resetCoins = (userId: string, to = 100) =>
  rpc<void>("admin_reset_coins", { p_user_id: userId, p_to: to });

export const resetRatings = (userId: string, to = 100) =>
  rpc<void>("admin_reset_ratings", { p_user_id: userId, p_to: to });

export const setRole = (userId: string, role: "user" | "moderator" | "admin" | "super_admin") =>
  rpc<void>("admin_set_role", { p_user_id: userId, p_role: role });

// ── Premium ──────────────────────────────────────────────────────────
export const grantPremium = (userId: string, tier = "gold", days = 30) =>
  rpc<void>("admin_grant_premium", { p_user_id: userId, p_tier: tier, p_days: days });

export const removePremium = (userId: string) =>
  rpc<void>("admin_remove_premium", { p_user_id: userId });

// ── Tournaments ──────────────────────────────────────────────────────
export const forceStartTournament = (id: string) =>
  rpc<void>("admin_force_start_tournament", { p_tournament_id: id });

export const forceEndTournament = (id: string) =>
  rpc<void>("admin_force_end_tournament", { p_tournament_id: id });

// ── Community ────────────────────────────────────────────────────────
export const deletePost = (postId: string) => rpc<void>("admin_delete_post", { p_post_id: postId });

export const deleteComment = (commentId: string) =>
  rpc<void>("admin_delete_comment", { p_comment_id: commentId });

export const moderatePost = (postId: string, pinned?: boolean, hidden?: boolean) =>
  rpc<void>("admin_moderate_post", {
    p_post_id: postId,
    p_pinned: pinned ?? null,
    p_hidden: hidden ?? null,
  });

// ── Reports ──────────────────────────────────────────────────────────
export const resolveReport = (
  reportId: string,
  action: "ignore" | "warn" | "ban",
  resolution?: string,
) =>
  rpc<void>("admin_resolve_report", {
    p_report_id: reportId,
    p_action: action,
    p_resolution: resolution ?? null,
  });

// ── Puzzles ──────────────────────────────────────────────────────────
export type AdminPuzzle = {
  id: string;
  fen: string;
  moves: string; // space-separated UCI in the DB
  rating: number;
  theme: string;
  category: string;
  goal: string;
  difficulty: string;
  explanation: string;
  themes: string[];
  enabled?: boolean;
};

export async function listPuzzles(
  search = "",
  category = "",
  minRating = 0,
  maxRating = 4000,
  limit = 100,
  difficulty = "",
): Promise<AdminPuzzle[]> {
  // Loose client: the puzzles table columns aren't in the generated types.
  let q = (supabase as unknown as { from: (n: string) => any })
    .from("puzzles")
    .select("id,fen,moves,rating,theme,category,goal,difficulty,explanation,themes,enabled")
    .gte("rating", minRating)
    .lte("rating", maxRating)
    .order("rating", { ascending: true })
    .limit(limit);
  if (category) q = q.eq("category", category);
  if (difficulty) q = q.eq("difficulty", difficulty);
  if (search) {
    // `id` is a UUID column — Postgres has no ILIKE for uuid, so route a
    // UUID-shaped search to an exact id match and everything else to a FEN
    // substring search.
    const trimmed = search.trim();
    const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
    q = looksLikeId ? q.eq("id", trimmed) : q.ilike("fen", `%${trimmed}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminPuzzle[];
}

export const upsertPuzzle = (p: Omit<Partial<AdminPuzzle>, "id"> & { id?: string | null }) =>
  rpc<string>("admin_upsert_puzzle", {
    p_id: p.id ?? null,
    p_fen: p.fen,
    p_moves: p.moves,
    p_rating: p.rating ?? 1000,
    p_theme: p.theme ?? "Tactics",
    p_category: p.category ?? "Tactics",
    p_goal: p.goal ?? "Best move",
    p_difficulty: p.difficulty ?? "Intermediate",
    p_explanation: p.explanation ?? "",
    p_themes: p.themes ?? [],
    p_enabled: p.enabled ?? true,
  });

export const deletePuzzle = (id: string) => rpc<void>("admin_delete_puzzle", { p_id: id });

export const setPuzzleEnabled = (id: string, enabled: boolean) =>
  rpc<void>("admin_set_puzzle_enabled", { p_id: id, p_enabled: enabled });

export const bulkImportPuzzles = (items: unknown[]) =>
  rpc<number>("admin_bulk_import_puzzles", { p_items: items });

// ── Notifications ────────────────────────────────────────────────────
export const broadcastNotification = (
  title: string,
  body: string,
  link?: string,
  segment: "all" | "premium" | "free" = "all",
) =>
  rpc<number>("admin_broadcast_notification", {
    p_title: title,
    p_body: body,
    p_link: link ?? null,
    p_segment: segment,
  });
