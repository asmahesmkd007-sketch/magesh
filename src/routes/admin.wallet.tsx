import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Search, Loader2, Coins, Lock } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { listUsers, adjustCoins, type AdminUser } from "@/lib/api/adminClient";

export const Route = createFileRoute("/admin/wallet")({
  head: () => ({ meta: [{ title: "Admin — Wallet — ChessOx" }] }),
  component: () => (
    <AdminShell title="Wallet Management">
      <WalletAdmin />
    </AdminShell>
  ),
});

type Tx = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
};

function WalletAdmin() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<AdminUser[]>([]);
  const [sel, setSel] = useState<AdminUser | null>(null);
  const [txns, setTxns] = useState<Tx[]>([]);
  const [amt, setAmt] = useState(100);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!search) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setResults(await listUsers(search, 8));
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadTxns = useCallback(async (userId: string) => {
    setLoading(true);
    const { data } = await (
      supabase as unknown as {
        from: (n: string) => {
          select: (s: string) => {
            eq: (
              c: string,
              v: string,
            ) => {
              order: (
                c: string,
                o: object,
              ) => { limit: (n: number) => Promise<{ data: unknown[] | null }> };
            };
          };
        };
      }
    )
      .from("wallet_transactions")
      .select("id,type,amount,balance_after,description,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    setTxns((data ?? []) as unknown as Tx[]);
    setLoading(false);
  }, []);

  function pick(u: AdminUser) {
    setSel(u);
    setResults([]);
    setSearch(u.username);
    loadTxns(u.id);
  }

  async function adjust(sign: 1 | -1) {
    if (!sel) return;
    try {
      const bal = await adjustCoins(sel.id, sign * Math.abs(amt), "Admin wallet adjustment");
      toast.success(`New balance: ${bal}`);
      setSel({ ...sel, balance: bal });
      loadTxns(sel.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div>
      <div className="relative mb-4">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSel(null);
            }}
            placeholder="Find a user by username…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-background shadow-xl">
            {results.map((u) => (
              <button
                key={u.id}
                onClick={() => pick(u)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5"
              >
                <span>{u.username}</span>
                <span className="text-gold">{u.balance}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {sel && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-gold/80">
                <Coins className="h-4 w-4" /> Balance
              </div>
              <div className="mt-1 font-display text-2xl">
                {sel.balance.toLocaleString("en-IN")}
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-amber-400/80">
                <Lock className="h-4 w-4" /> Locked
              </div>
              <div className="mt-1 font-display text-2xl">
                {sel.locked_balance.toLocaleString("en-IN")}
              </div>
            </Card>
            <Card className="flex flex-col justify-center gap-2 p-4">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={amt}
                  onChange={(e) => setAmt(Number(e.target.value))}
                  className="w-20 rounded-lg border border-white/10 bg-transparent px-2 py-1 text-sm"
                />
                <button
                  onClick={() => adjust(1)}
                  className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400"
                >
                  Add
                </button>
                <button
                  onClick={() => adjust(-1)}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-400"
                >
                  Remove
                </button>
              </div>
            </Card>
          </div>

          <Card className="p-0">
            <div className="border-b border-white/5 px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">
              Transaction History
            </div>
            {loading ? (
              <div className="grid place-items-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-gold" />
              </div>
            ) : txns.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No transactions.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {txns.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <div>{t.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.type} · {new Date(t.created_at).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div className={t.amount >= 0 ? "text-emerald-400" : "text-rose-400"}>
                      {t.amount >= 0 ? "+" : ""}
                      {t.amount}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
