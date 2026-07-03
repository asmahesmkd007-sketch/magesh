// =====================================================================
// WALLET SERVICE LAYER (client)
// ---------------------------------------------------------------------
// All wallet mutations go through SECURITY DEFINER RPCs. The client
// never writes to wallets or wallet_transactions directly.
// =====================================================================
import { supabase } from "@/integrations/supabase/client";

export type TransactionType =
  | "premium_bonus"
  | "tournament_entry"
  | "tournament_prize"
  | "tournament_refund"
  | "admin_credit"
  | "admin_debit"
  | "refund"
  | "welcome_bonus";

export type WalletTransaction = {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  balance_after: number;
  description: string;
  reference_id: string | null;
  idempotency_key: string | null;
  created_at: string;
};

export type Wallet = {
  id: string;
  user_id: string;
  balance: number;
  locked_balance: number;
  total_earned: number;
  total_spent: number;
  created_at: string;
  updated_at: string;
};

type RpcMap = {
  credit_premium_bonus: {
    args: { p_plan_name: string; p_base_coins: number; p_idempotency_key: string };
    returns: null;
  };
  join_tournament_paid: {
    args: { p_tournament_id: string };
    returns: null;
  };
  refund_tournament_entry: {
    args: { p_tournament_id: string };
    returns: null;
  };
  cancel_tournament: {
    args: { p_tournament_id: string };
    returns: null;
  };
  handle_no_show: {
    args: { p_match_id: string };
    returns: null;
  };
  ensure_tournament_slots: {
    args: Record<string, never>;
    returns: { checked: number; created: number };
  };
};

async function callRpc<K extends keyof RpcMap>(
  name: K,
  args: RpcMap[K]["args"],
): Promise<RpcMap[K]["returns"]> {
  const client = supabase as unknown as {
    rpc: (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as RpcMap[K]["returns"];
}

/** Fetch the current user's wallet row. */
export async function getWallet(): Promise<Wallet | null> {
  const { data, error } = await supabase
    .from("wallets" as never)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Wallet | null;
}

/** Fetch recent wallet transactions for the current user. */
export async function getTransactions(limit = 50): Promise<WalletTransaction[]> {
  const { data, error } = await supabase
    .from("wallet_transactions" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as WalletTransaction[];
}

/**
 * Credit coins from a premium plan purchase.
 * p_base_coins is the plan's base amount; the server adds +10 bonus.
 * p_idempotency_key should be the payment provider's transaction ID
 * (or a timestamp-based key for demo purchases).
 */
export function creditPremiumBonus(
  planName: string,
  baseCoins: number,
  idempotencyKey: string,
): Promise<null> {
  return callRpc("credit_premium_bonus", {
    p_plan_name: planName,
    p_base_coins: baseCoins,
    p_idempotency_key: idempotencyKey,
  });
}

/**
 * Join a paid tournament. Atomically deducts entry fee and registers
 * the player. Throws 'Insufficient wallet balance' if balance too low.
 */
export function joinTournamentPaid(tournamentId: string): Promise<null> {
  return callRpc("join_tournament_paid", { p_tournament_id: tournamentId });
}

/** Withdraw from an upcoming tournament and get a refund. */
export function refundTournamentEntry(tournamentId: string): Promise<null> {
  return callRpc("refund_tournament_entry", { p_tournament_id: tournamentId });
}

/** Claim a no-show win after the grace period has elapsed. */
export function claimNoShow(matchId: string): Promise<null> {
  return callRpc("handle_no_show", { p_match_id: matchId });
}

/** Admin-only: cancel a tournament and refund every paid entrant. */
export function cancelTournament(tournamentId: string): Promise<null> {
  return callRpc("cancel_tournament", { p_tournament_id: tournamentId });
}

/**
 * Ensure every tournament category has at least one UPCOMING tournament.
 * Call on page load and periodically for auto-recovery.
 */
export function ensureTournamentSlots(): Promise<{ checked: number; created: number }> {
  return callRpc("ensure_tournament_slots", {});
}
