// Admin — Chat: live stats + message report queue (resolve/dismiss).
// Server-side gated by is_admin RPCs, same pattern as admin.community.tsx.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card, Stat } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { fetchChatStats, resolveChatReport, type ChatStats } from "@/lib/api/chatClient";

export const Route = createFileRoute("/admin/chat")({
  head: () => ({ meta: [{ title: "Admin — Chat — ChessOx" }] }),
  component: () => (
    <AdminShell title="Chat Moderation">
      <ChatAdmin />
    </AdminShell>
  ),
});

type Report = {
  id: string;
  message_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
};

function ChatAdmin() {
  const [stats, setStats] = useState<ChatStats | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        fetchChatStats(),
        (async () => {
          let q = (supabase as any).from("chat_reports").select("*").order("created_at", { ascending: false }).limit(100);
          if (filter === "open") q = q.eq("status", "open");
          const { data } = await q;
          return (data ?? []) as Report[];
        })(),
      ]);
      setStats(s);
      setReports(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id: string, status: "resolved" | "dismissed") {
    try {
      await resolveChatReport(id, status);
      toast.success(status === "resolved" ? "Report resolved" : "Report dismissed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="space-y-5">
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Rooms" value={stats.rooms} />
          <Stat label="Direct Conversations" value={stats.dms} />
          <Stat label="Messages (24h)" value={stats.messages_24h} />
          <Stat label="Open Reports" value={stats.open_reports} />
        </div>
      )}
      <div className="flex gap-2">
        {(["open", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-4 py-1.5 text-xs capitalize ${
              filter === f ? "border-gold/50 bg-gold/10 text-gold" : "border-white/10 text-muted-foreground"
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
        <Card className="p-6 text-sm text-muted-foreground">No reports. 🎉</Card>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-rose-500/15 px-2 py-0.5 capitalize text-rose-300">
                      {r.reason.replace("_", " ")}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 capitalize ${
                        r.status === "open" ? "bg-amber-500/15 text-amber-300" : "bg-white/5 text-muted-foreground"
                      }`}
                    >
                      {r.status}
                    </span>
                    <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("en-IN")}</span>
                  </div>
                  {r.details && <p className="mt-1.5 text-xs text-muted-foreground">{r.details}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">Message ID: {r.message_id}</p>
                </div>
                {r.status === "open" && (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      onClick={() => resolve(r.id, "resolved")}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-muted-foreground hover:text-gold"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
                    </button>
                    <button
                      onClick={() => resolve(r.id, "dismissed")}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-muted-foreground hover:text-gold"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Dismiss
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
