import { useCallback, useEffect, useState } from "react";
import { clanDb } from "@/lib/clanDb";
import { useAuth } from "@/hooks/useAuth";

export function useMyClan() {
  const { user } = useAuth();
  const [clanId, setClanId] = useState<string | null>(null);
  const [clanSlug, setClanSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setClanId(null);
      setClanSlug(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await clanDb
      .from("clan_members")
      .select("clan_id, clans(slug)")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setClanId(data.clan_id);
      setClanSlug((data as any).clans?.slug ?? null);
    } else {
      setClanId(null);
      setClanSlug(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { clanId, clanSlug, loading, refresh };
}
