import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Flag, Check, Ban, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";

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
  type: string;
  issue_type: string;
  reported_user: string | null;
  reason: string | null;
  description: string;
  status: string;
  created_at: string;
};

function ReportsAdmin() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open"); // Must match schema check constraint: 'open', 'resolved', 'ignored'

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reports")
      .select("id,type,issue_type,reported_user,reason,description,status,created_at")
      .eq("status", filter)
      .order("created_at", { ascending: false });
      
    if (error) {
      toast.error(error.message);
    }
    
    setReports((data ?? []) as unknown as Report[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, action: "ignored" | "resolved") {
    try {
      const { error } = await (supabase as any).rpc("admin_resolve_platform_report", { 
        p_report_id: id, 
        p_status: action 
      });
      if (error) throw new Error(error.message);
      toast.success(`Report ${action}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {["open", "resolved", "ignored"].map((f) => (
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
                    <span className="capitalize text-muted-foreground">{r.issue_type}</span>
                    <span className="font-medium">{r.reason}</span>
                  </div>
                  {r.description && <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{r.description}</p>}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("en-IN")}
                    {r.reported_user && ` · Target ID: ${r.reported_user}`}
                  </div>
                </div>
                {filter === "open" && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => act(r.id, "ignored")}
                      className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      <Check className="h-3 w-3" /> Ignore
                    </button>
                    <button
                      onClick={() => act(r.id, "resolved")}
                      className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400"
                    >
                      <Check className="h-3 w-3" /> Resolve
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
