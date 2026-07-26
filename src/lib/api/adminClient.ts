// =====================================================================
// ADMIN SERVICE LAYER (client)
// ---------------------------------------------------------------------
// Every mutation is a SECURITY DEFINER RPC that re-checks the caller's
// admin role server-side (public.has_role(auth.uid(),'admin')) and
// writes to public.admin_audit_logs via log_admin_action(). The frontend
// role check (useIsAdmin) only hides the UI — it is never the gate.
//
// These types/functions are wired to the REAL live production schema
// (verified directly against the connected Supabase project), which in
// several places differs from supabase/schema.sql in this repo — e.g.
// withdrawals live in `withdraw_requests` (UPI-based) not
// `withdrawal_requests`/bank details, premium lives in `memberships`
// not `subscriptions`, user status is `profiles.status`
// (active/blocked/banned/suspended/muted), and real gameplay rows are
// in `matches`, not `games`. Backend: see admin_core_infra_* and
// admin_premium_withdrawals_kyc_support_puzzles_broadcast_tournaments
// migrations applied directly to the live project.
// =====================================================================
import { supabase } from "@/integrations/supabase/client";

export type AdminStats = {
  total_users: number;
  online_users: number;
  new_users_today: number;
  premium_users: number;
  banned_users: number;
  suspended_users: number;
  coins_in_system: number;
  locked_coins: number;
  total_deposits: number;
  total_withdrawals_amt: number;
  pending_withdrawals: number;
  completed_withdrawals: number;
  rejected_withdrawals: number;
  withdrawals_amount_pending: number;
  total_matches: number;
  matches_today: number;
  live_matches: number;
  finished_matches: number;
  total_tournaments: number;
  upcoming_tournaments: number;
  live_tournaments: number;
  completed_tournaments: number;
  prize_distributed: number;
  total_clans: number;
  active_clan_wars: number;
  community_posts: number;
  community_comments: number;
  reports_pending: number;
  feedback_total: number;
  support_tickets_open: number;
  kyc_pending: number;
  total_puzzles: number;
  total_puzzle_attempts: number;
  puzzles_solved: number;
};

export type AdminUser = {
  id: string;
  username: string;
  display_name: string | null;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  country: string | null;
  status: "active" | "blocked" | "banned" | "suspended" | "muted";
  kyc_status: string;
  is_member: boolean;
  membership_tier: string | null;
  membership_status: string;
  iq_level: number;
  rank: string;
  is_online: boolean;
  last_seen: string | null;
  created_at: string;
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  premium_tier: string;
  premium_active: boolean;
  is_admin: boolean;
  is_super_admin: boolean;
  balance: number;
  locked_balance: number;
  role: string | null;
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

export type AdminWithdrawal = {
  id: string;
  user_id: string;
  username: string;
  full_name: string | null;
  amount: number;
  gst_amount: number;
  net_amount: number;
  status: "pending" | "approved" | "rejected" | "completed" | "success";
  upi_id: string | null;
  admin_note: string | null;
  rejection_reason: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
};

export type AdminKycRequest = {
  id: string;
  user_id: string;
  username: string;
  document_type: "aadhaar" | "pan" | "passport";
  name: string;
  dob: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  front_image_url: string | null;
  back_image_url: string | null;
  full_image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminSupportTicket = {
  id: string;
  user_id: string | null;
  username: string | null;
  email: string;
  priority: "low" | "medium" | "high" | "critical";
  issue_type: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
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
// Real profiles.status check constraint: active | blocked | banned | suspended | muted
export const setUserStatus = (
  userId: string,
  status: AdminUser["status"],
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

// Real app_role enum only has admin/moderator/user — there is no
// "super_admin" role value. Super-admin is a separate boolean flag
// (profiles.is_super_admin), toggled via setSuperAdmin below.
export const setRole = (userId: string, role: "user" | "moderator" | "admin") =>
  rpc<void>("admin_set_role", { p_user_id: userId, p_role: role });

export const setSuperAdmin = (userId: string, value: boolean) =>
  rpc<void>("admin_set_super_admin", { p_user_id: userId, p_value: value });

// ── Premium (real backing table is `memberships`, tiers: basic/pro/grandmaster) ──
export const grantPremium = (
  userId: string,
  tier: "basic" | "pro" | "grandmaster" = "pro",
  days = 30,
) => rpc<void>("admin_grant_premium", { p_user_id: userId, p_tier: tier, p_days: days });

export const removePremium = (userId: string) =>
  rpc<void>("admin_remove_premium", { p_user_id: userId });

// ── Tournaments (real status values: upcoming/locked/full/live/starting/completed/cancelled) ──
export const forceStartTournament = (id: string) =>
  rpc<void>("admin_force_start_tournament", { p_tournament_id: id });

export const forceEndTournament = (id: string) =>
  rpc<void>("admin_force_end_tournament", { p_tournament_id: id });

// ── Community ────────────────────────────────────────────────────────
export const deletePost = (postId: string) => rpc<void>("admin_delete_post", { p_post_id: postId });

export const moderatePost = (postId: string, pinned?: boolean, hidden?: boolean) =>
  rpc<void>("admin_moderate_post", {
    p_post_id: postId,
    p_pinned: pinned ?? null,
    p_hidden: hidden ?? null,
  });

// ── Reports (public.reports table; status: open/resolved/ignored) ─────
export const resolveReport = (reportId: string, status: "resolved" | "ignored") =>
  rpc<void>("admin_resolve_report", { p_report_id: reportId, p_status: status });

// ── Withdrawals (real table: withdraw_requests, UPI-based) ────────────
export const getWithdrawalRequests = (status?: string) =>
  rpc<AdminWithdrawal[]>("admin_get_withdrawal_requests", { p_status: status ?? null });

export const approveWithdrawal = (id: string, note?: string) =>
  rpc<void>("admin_approve_withdrawal", { p_id: id, p_note: note ?? null });

export const rejectWithdrawal = (id: string, reason: string) =>
  rpc<void>("admin_reject_withdrawal", { p_id: id, p_reason: reason });

// ── KYC review (new admin surface — kyc_requests had no admin UI before) ──
export const listKycRequests = (status?: string) =>
  rpc<AdminKycRequest[]>("admin_list_kyc_requests", { p_status: status ?? null });

export const reviewKyc = (id: string, approve: boolean, reason?: string) =>
  rpc<void>("admin_review_kyc", { p_id: id, p_approve: approve, p_reason: reason ?? null });

// ── Support tickets (new admin surface) ────────────────────────────────
export const listSupportTickets = (status?: string) =>
  rpc<AdminSupportTicket[]>("admin_list_support_tickets", { p_status: status ?? null });

export const updateTicketStatus = (id: string, status: AdminSupportTicket["status"]) =>
  rpc<void>("admin_update_ticket_status", { p_id: id, p_status: status });

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
    const trimmed = search.trim();
    const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      trimmed,
    );
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
