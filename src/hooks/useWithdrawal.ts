import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type WithdrawalStatus = "pending" | "approved" | "rejected" | "cancelled" | "completed";

export type WithdrawalRequest = {
  id: string;
  user_id: string;
  bank_details_id: string;
  amount: number;
  status: WithdrawalStatus;
  reject_reason: string | null;
  admin_id: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
};

export type AdminWithdrawalRequest = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  amount: number;
  bank_name: string;
  account_last4: string;
  ifsc_code: string;
  status: WithdrawalStatus;
  reject_reason: string | null;
  admin_id: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
};

export function useWithdrawalRequests(userId?: string | null) {
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await (supabase as any)
      .from("withdrawal_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setRequests((data ?? []) as WithdrawalRequest[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetch();
    if (!userId) return;

    const channelId = `withdrawals:${userId}:${Math.random().toString(36).substring(7)}`;
    const channel = (supabase as any)
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "withdrawal_requests",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetch();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetch]);

  return { requests, loading, refetch: fetch };
}

export async function submitWithdrawal(amount: number): Promise<string | null> {
  try {
    const { data, error } = await (supabase as any).rpc("submit_withdrawal_request", {
      p_amount: amount,
    });
    if (error) throw new Error(error.message);
    toast.success("Withdrawal request submitted successfully");
    return data as string;
  } catch (err: any) {
    toast.error(err.message || "Failed to submit withdrawal request");
    return null;
  }
}

export async function cancelWithdrawal(requestId: string): Promise<boolean> {
  try {
    const { error } = await (supabase as any).rpc("cancel_withdrawal_request", {
      p_request_id: requestId,
    });
    if (error) throw new Error(error.message);
    toast.success("Withdrawal cancelled. Amount returned to your wallet.");
    return true;
  } catch (err: any) {
    toast.error(err.message || "Failed to cancel withdrawal");
    return false;
  }
}

export async function adminApproveWithdrawal(requestId: string): Promise<boolean> {
  try {
    const { error } = await (supabase as any).rpc("admin_approve_withdrawal", {
      p_request_id: requestId,
    });
    if (error) throw new Error(error.message);
    toast.success("Withdrawal approved. User has been notified.");
    return true;
  } catch (err: any) {
    toast.error(err.message || "Failed to approve withdrawal");
    return false;
  }
}

export async function adminRejectWithdrawal(requestId: string, reason?: string): Promise<boolean> {
  try {
    const { error } = await (supabase as any).rpc("admin_reject_withdrawal", {
      p_request_id: requestId,
      p_reason: reason ?? null,
    });
    if (error) throw new Error(error.message);
    toast.success("Withdrawal rejected. Amount returned to user's wallet.");
    return true;
  } catch (err: any) {
    toast.error(err.message || "Failed to reject withdrawal");
    return false;
  }
}

export async function adminGetWithdrawals(
  status?: WithdrawalStatus,
): Promise<AdminWithdrawalRequest[]> {
  const { data, error } = await (supabase as any).rpc("admin_get_withdrawal_requests", {
    p_status: status ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminWithdrawalRequest[];
}
