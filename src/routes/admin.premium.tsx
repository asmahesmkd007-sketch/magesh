import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Crown, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { listUsers, grantPremium, removePremium, type AdminUser } from "@/lib/api/adminClient";

export const Route = createFileRoute("/admin/premium")({
  head: () => ({ meta: [{ title: "Admin — Premium — ChessOx" }] }),
  component: () => (
    <AdminShell title="Premium Management">
      <PremiumAdmin />
    </AdminShell>
  ),
});

type PremiumRow = {
  id: string;
  username: string;
  premium_tier: string;
  premium_expires_at: string | null;
};

function PremiumAdmin() {
  const [rows, setRows] = useState<PremiumRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<AdminUser[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (
      supabase as unknown as {
        from: (n: string) => {
          select: (s: string) => {
            eq: (
              c: string,
              v: boolean,
            ) => {
              order: (c: string, o: object) => Promise<{ data: unknown[] | null }>;
            };
          };
        };
      }
    )
      .from("profiles")
      .select("id,username,premium_tier,premium_expires_at")
      .eq("premium_active", true)
      .order("premium_expires_at", { ascending: true });
    setRows((data ?? []) as unknown as PremiumRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!search) {
      setFound([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setFound(await listUsers(search, 6));
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      setSearch("");
      setFound([]);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          Grant premium to a user
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          {found.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-background shadow-xl">
              {found.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between px-3 py-2 text-sm hover:bg-white/5"
                >
                  <span>{u.username}</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => act(() => grantPremium(u.id, "gold", 30), "Gold granted")}
                      className="rounded border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs text-gold"
                    >
                      +30d Gold
                    </button>
                    <button
                      onClick={() =>
                        act(() => grantPremium(u.id, "platinum", 30), "Platinum granted")
                      }
                      className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-400"
                    >
                      +30d Platinum
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-0">
        <div className="border-b border-white/5 px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">
          Active Premium Users
        </div>
        {loading ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No active premium users.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-gold" />
                  <span>{r.username}</span>
                  <span className="text-xs uppercase text-gold">{r.premium_tier}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {r.premium_expires_at
                      ? `expires ${new Date(r.premium_expires_at).toLocaleDateString("en-IN")}`
                      : "no expiry"}
                  </span>
                  <button
                    onClick={() =>
                      act(() => grantPremium(r.id, r.premium_tier, 30), "Extended 30 days")
                    }
                    className="rounded border border-white/10 px-2 py-0.5 text-xs hover:text-gold"
                  >
                    Extend 30d
                  </button>
                  <button
                    onClick={() => act(() => removePremium(r.id), "Premium removed")}
                    className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
