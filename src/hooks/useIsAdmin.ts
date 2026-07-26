import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// profiles.is_admin is the sole authority every backend admin RPC checks
// (SECURITY DEFINER functions re-verify it server-side on every call).
// This hook only controls what the UI shows — it is never the real gate.
export function useIsAdmin(userId?: string | null) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    let isMounted = true;
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }).then(({ data }) => {
      if (isMounted) {
        setIsAdmin(!!data);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [userId]);

  return { isAdmin, loading };
}
