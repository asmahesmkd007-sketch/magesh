import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Star } from "lucide-react";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { getFeedbacks, type FeedbackRow } from "@/lib/api/feedbackClient";

export const Route = createFileRoute("/admin/feedback")({
  head: () => ({ meta: [{ title: "Admin — Feedback — ChessOx" }] }),
  component: () => (
    <AdminShell title="User Feedback">
      <AdminFeedback />
    </AdminShell>
  ),
});

function AdminFeedback() {
  const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getFeedbacks()
      .then(setFeedbacks)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  if (err) {
    return <Card className="p-6 text-sm text-rose-400">{err}</Card>;
  }

  if (feedbacks.length === 0) {
    return (
      <Card className="p-12 text-center text-muted-foreground border-dashed border-white/10">
        No feedback submitted yet.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {feedbacks.map((f) => (
        <Card key={f.id} className="p-5 flex flex-col gap-3 border-white/10">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`h-4 w-4 ${s <= f.rating ? "fill-gold text-gold" : "text-white/20"}`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {new Date(f.created_at).toLocaleString()}
            </span>
          </div>
          <p className="text-sm text-ivory leading-relaxed whitespace-pre-wrap">{f.message}</p>
          <div className="text-xs text-muted-foreground pt-2 border-t border-white/5">
            User ID: {f.user_id ? <span className="font-mono">{f.user_id}</span> : <em>Anonymous</em>}
          </div>
        </Card>
      ))}
    </div>
  );
}
