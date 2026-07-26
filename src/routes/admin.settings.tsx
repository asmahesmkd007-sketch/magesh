import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Megaphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { broadcastNotification } from "@/lib/api/adminClient";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "Admin — Settings — ChessOx" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell title="Settings & Notifications">
      <SettingsAdmin />
    </AdminShell>
  ),
});

function SettingsAdmin() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [segment, setSegment] = useState<"all" | "premium" | "free">("all");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and message are required");
      return;
    }
    setSending(true);
    try {
      const n = await broadcastNotification(
        title.trim(),
        body.trim(),
        link.trim() || undefined,
        segment,
      );
      toast.success(`Sent to ${n} user${n === 1 ? "" : "s"}`);
      setTitle("");
      setBody("");
      setLink("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    }
    setSending(false);
  }

  return (
    <div className="max-w-2xl space-y-5">
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-gold" />
          <h2 className="font-display text-lg">Broadcast Notification</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
              Audience
            </label>
            <div className="flex gap-2">
              {(["all", "premium", "free"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSegment(s)}
                  className={`rounded-lg border px-3 py-1.5 text-xs capitalize ${
                    segment === s
                      ? "border-gold/40 bg-gold/10 text-gold"
                      : "border-white/10 text-muted-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message…"
            rows={4}
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none"
          />
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Link (optional, e.g. /premium)"
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none"
          />
          <button
            onClick={send}
            disabled={sending}
            className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold hover:bg-gold/20 disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Megaphone className="h-4 w-4" />
            )}
            Send Broadcast
          </button>
        </div>
      </Card>

      <Card className="p-6 text-sm text-muted-foreground">
        <p>
          Role management (promote/remove admins) is available on the{" "}
          <span className="text-gold">Users</span> page and is restricted to super admins. Every
          admin action across the panel is written to the{" "}
          <span className="text-gold">Audit Logs</span>.
        </p>
      </Card>
    </div>
  );
}
