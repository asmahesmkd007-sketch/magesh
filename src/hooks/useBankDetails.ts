import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { saveBankDetailsServerFn } from "@/lib/api/bank.functions";
import { toast } from "sonner";

export type BankAccount = {
  id: string;
  user_id: string;
  account_holder_name: string;
  account_number_last4: string;
  ifsc_code: string;
  bank_name: string;
  branch_name: string;
  branch_address: string;
  account_type: "savings" | "current";
  verification_status: "verified" | "failed" | "pending";
  created_at: string;
};

export function useBankDetails(userId?: string) {
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function fetchDetails() {
      if (!userId) return;
      try {
        const { data, error } = await supabase
          .from("bank_details")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (error && error.code !== "PGRST116") {
          console.error("Error fetching bank details:", error);
        } else if (isMounted) {
          setBankAccount(data as BankAccount | null);
        }
      } catch (err) {
        console.error("Error fetching bank details:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchDetails();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const saveBankDetails = async (params: {
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
    bankName: string;
    branchName: string;
    branchAddress: string;
    accountType: "savings" | "current";
  }) => {
    try {
      const activeUserId = userId || (await supabase.auth.getUser()).data.user?.id;

      if (!activeUserId) {
        toast.error("User not authenticated");
        return false;
      }

      // Try server function with admin credentials first (bypasses pgcrypto extension & client RLS)
      try {
        await saveBankDetailsServerFn({
          data: {
            userId: activeUserId,
            accountHolderName: params.accountHolderName,
            accountNumber: params.accountNumber,
            ifscCode: params.ifscCode,
            bankName: params.bankName,
            branchName: params.branchName,
            branchAddress: params.branchAddress,
            accountType: params.accountType,
          },
        });
      } catch (serverErr: any) {
        console.warn("Server function failed, trying RPC:", serverErr?.message);
        // Secondary fallback to RPC
        const { error: rpcError } = await supabase.rpc("save_bank_details", {
          p_account_holder_name: params.accountHolderName,
          p_account_number: params.accountNumber,
          p_ifsc_code: params.ifscCode,
          p_bank_name: params.bankName,
          p_branch_name: params.branchName,
          p_branch_address: params.branchAddress,
          p_account_type: params.accountType,
        });

        if (rpcError) {
          throw rpcError;
        }
      }

      toast.success("Bank details saved successfully");

      // Re-fetch the updated details to get the saved bank account
      if (activeUserId) {
        const { data: newData } = await supabase
          .from("bank_details")
          .select("*")
          .eq("user_id", activeUserId)
          .single();
        if (newData) {
          setBankAccount(newData as BankAccount);
        }
      }
      return true;
    } catch (err: any) {
      toast.error(err.message || "Failed to save bank details");
      return false;
    }
  };

  return { bankAccount, loading, saveBankDetails };
}
