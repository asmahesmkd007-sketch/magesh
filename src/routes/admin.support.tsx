import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, LifeBuoy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import {
  listSupportTickets,
  updateTicketStatus,
  type AdminSupportTicket,
} from "@/lib/api/adminClient";

export const Route = createFileRoute("/admin/support")({
  head: () => ({
    meta: [
      { title: "Admin — Support Tickets — ChessOx" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell title="Support Tickets">
      <SupportPage />
    </AdminShell>
  ),
});

const STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
const PRIORITY_CLS: Record<string, string> = {
  critical: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  high: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  medium: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  low: "border-white/10 text-muted-foreground",
};

function SupportPage() {
  const [filter, setFilter] = useState<string>("open");
  const [rows, setRows] = useState<AdminSupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      setRows(await listSupportTickets(status === "all" ? undefined : status));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load tickets");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  async function setStatus(id: string, status: AdminSupportTicket["status"]) {
    try {
      await updateTicketStatus(id, status);
      toast.success(`Ticket marked ${status}`);
      load(filter);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Support requests submitted from login, payment, matchmaking, and account issue flows.
      </p>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {["all", ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full border px-4 py-1.5 text-xs capitalize transition ${
                filter === s
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-white/10 text-muted-foreground hover:border-gold/30"
              }`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
        <button
          onClick={() => load(filter)}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-gold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No tickets found.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((t) => (
              <div key={t.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5">
                  <LifeBuoy className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{t.username ?? t.email}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${PRIORITY_CLS[t.priority] ?? ""}`}
                    >
                      {t.priority}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.issue_type.replace("_", " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-foreground/90">{t.message}</p>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t.email} · {new Date(t.created_at).toLocaleString("en-IN")}
                  </div>
                </div>
                <select
                  value={t.status}
                  onChange={(e) => setStatus(t.id, e.target.value as AdminSupportTicket["status"])}
                  className="shrink-0 rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-xs capitalize outline-none"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-background">
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
