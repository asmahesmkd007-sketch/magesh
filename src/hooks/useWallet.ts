import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Wallet, WalletTransaction } from "@/lib/api/walletClient";

export function useWallet(userId?: string | null) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) {
      setWallet(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await (
      supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (
              col: string,
              val: string,
            ) => {
              maybeSingle: () => Promise<{ data: unknown }>;
            };
          };
        };
      }
    )
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    setWallet((data as Wallet) ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetch();

    if (!userId) return;

    // Real-time subscription — keeps balance live across tabs
    const channelId = `wallet:${userId}:${Math.random().toString(36).substring(7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "wallets",
          filter: `user_id=eq.${userId}`,
        } as never,
        (payload: { new: Wallet }) => {
          if (payload.new) setWallet(payload.new);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetch]);

  return { wallet, loading, refetch: fetch };
}

export function useWalletTransactions(userId?: string | null, limit = 50) {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) {
      setTransactions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await (
      supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (
              col: string,
              val: string,
            ) => {
              order: (
                col: string,
                opts: object,
              ) => {
                limit: (n: number) => Promise<{ data: unknown[] | null }>;
              };
            };
          };
        };
      }
    )
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    setTransactions((data ?? []) as WalletTransaction[]);
    setLoading(false);
  }, [userId, limit]);

  useEffect(() => {
    fetch();

    if (!userId) return;

    const channelId = `wallet_tx:${userId}:${Math.random().toString(36).substring(7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "wallet_transactions",
          filter: `user_id=eq.${userId}`,
        } as never,
        (payload: { new: WalletTransaction }) => {
          if (payload.new) {
            setTransactions((prev) => [payload.new, ...prev]);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetch]);

  return { transactions, loading, refetch: fetch };
}
