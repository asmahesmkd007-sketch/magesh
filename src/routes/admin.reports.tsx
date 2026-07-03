import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Flag, Check, Ban, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { resolveReport } from "@/lib/api/adminClient";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({ meta: [{ title: "Admin — Reports — ChessOx" }] }),
  component: () => (
    <AdminShell title="Report Center">
      <ReportsAdmin />
    </AdminShell>
  ),
});

type Report = {
  id: string;
  target_type: string;
  target_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
};

function ReportsAdmin() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (
      supabase as unknown as {
        from: (n: string) => {
          select: (s: string) => {
            eq: (
              c: string,
              v: string,
            ) => {
              order: (c: string, o: object) => Promise<{ data: unknown[] | null }>;
            };
          };
        };
      }
    )
      .from("reports")
      .select("id,target_type,target_id,reason,details,status,created_at")
      .eq("status", filter)
      .order("created_at", { ascending: false });
    setReports((data ?? []) as unknown as Report[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, action: "ignore" | "warn" | "ban") {
    try {
      await resolveReport(id, action);
      toast.success(`Report ${action}ed`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {["pending", "resolved", "ignored"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-xs capitalize ${
              filter === f
                ? "border-gold/40 bg-gold/10 text-gold"
                : "border-white/10 text-muted-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : reports.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No {filter} reports.</Card>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm">
                    <Flag className="h-4 w-4 text-rose-400" />
                    <span className="capitalize text-muted-foreground">{r.target_type}</span>
                    <span className="font-medium">{r.reason}</span>
                  </div>
                  {r.details && <p className="mt-1 text-sm text-muted-foreground">{r.details}</p>}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("en-IN")}
                    {r.target_id && ` · target ${r.target_id.slice(0, 8)}`}
                  </div>
                </div>
                {filter === "pending" && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => act(r.id, "ignore")}
                      className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      <Check className="h-3 w-3" /> Ignore
                    </button>
                    <button
                      onClick={() => act(r.id, "warn")}
                      className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400"
                    >
                      <AlertTriangle className="h-3 w-3" /> Warn
                    </button>
                    <button
                      onClick={() => act(r.id, "ban")}
                      className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-400"
                    >
                      <Ban className="h-3 w-3" /> Ban
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
