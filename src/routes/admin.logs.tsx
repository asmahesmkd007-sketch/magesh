import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { getAuditLogs, type AdminAuditLog } from "@/lib/api/adminClient";

export const Route = createFileRoute("/admin/logs")({
  head: () => ({ meta: [{ title: "Admin — Audit Logs — ChessOx" }] }),
  component: () => (
    <AdminShell title="Audit Logs">
      <LogsAdmin />
    </AdminShell>
  ),
});

function LogsAdmin() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuditLogs(200)
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <Card className="p-0">
      {logs.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No admin actions logged yet.</p>
      ) : (
        <div className="divide-y divide-white/5">
          {logs.map((l) => (
            <div key={l.id} className="flex items-start gap-3 px-4 py-3 text-sm">
              <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-gold/70" />
              <div className="min-w-0 flex-1">
                <div>
                  <span className="font-medium text-gold">{l.action}</span>
                  <span className="text-muted-foreground"> · {l.target_type}</span>
                  {l.old_status && l.new_status && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({l.old_status} → {l.new_status})
                    </span>
                  )}
                </div>
                {l.metadata && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {JSON.stringify(l.metadata)}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {new Date(l.created_at).toLocaleString("en-IN")}
                  {l.target_id && ` · ${l.target_id.slice(0, 8)}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
