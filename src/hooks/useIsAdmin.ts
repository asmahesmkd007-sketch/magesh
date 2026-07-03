import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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
    (supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }: { data: unknown }) => {
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
