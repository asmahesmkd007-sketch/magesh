import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Search = { type?: string; id?: string };

export const Route = createFileRoute("/report")({
  head: () => ({ meta: [{ title: "Report an Issue — ChessOx" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    type: typeof s.type === "string" ? s.type : undefined,
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  component: ReportPage,
});

const TARGETS = ["user", "post", "comment", "game"] as const;
const REASONS = [
  "Cheating / fair-play violation",
  "Harassment or abuse",
  "Offensive content",
  "Spam",
  "Impersonation",
  "Bug / technical issue",
  "Other",
];

function ReportPage() {
  const { type: initType, id: initId } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [targetType, setTargetType] = useState<string>(
    initType && (TARGETS as readonly string[]).includes(initType) ? initType : "user",
  );
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!user) {
      toast.error("Sign in to submit a report");
      return;
    }
    if (!reason) {
      toast.error("Please choose a reason");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await (
        supabase as unknown as {
          from: (n: string) => {
            insert: (
              row: Record<string, unknown>,
            ) => Promise<{ error: { message: string } | null }>;
          };
        }
      )
        .from("reports")
        .insert({
          reporter_id: user.id,
          type: targetType === 'user' || targetType === 'game' ? 'player' : 'issue',
          issue_type: targetType,
          reported_user: initId ?? null,
          reason,
          description: details.trim() || reason,
        });
      if (error) throw new Error(error.message);
      toast.success("Report submitted — our moderation team will review it.");
      navigate({ to: "/home" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit report");
    }
    setSubmitting(false);
  }

  return (
    <PageShell title="Report Issue">
      <Card className="mx-auto mt-8 max-w-2xl border-gold/20 p-8">
        <div className="mb-6 grid h-16 w-16 place-items-center rounded-full bg-gold/10 text-gold">
          <Flag className="h-8 w-8" />
        </div>
        <h1 className="mb-2 font-display text-3xl text-gradient-gold">Report an Issue</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Report a bug or a violation of our fair-play and conduct rules. Reports go straight to the
          moderation team.
        </p>

        {initId && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground">
            Reporting {targetType} <span className="text-gold">{initId.slice(0, 8)}</span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
              What are you reporting?
            </label>
            <div className="flex flex-wrap gap-2">
              {TARGETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTargetType(t)}
                  className={`rounded-lg border px-3 py-1.5 text-xs capitalize ${
                    targetType === t
                      ? "border-gold/40 bg-gold/10 text-gold"
                      : "border-white/10 text-muted-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
              Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none"
            >
              {REASONS.map((r) => (
                <option key={r} value={r} className="bg-background">
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
              Details (optional)
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              placeholder="Add any context that will help us investigate…"
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <GoldButton onClick={submit} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Flag className="h-4 w-4" />
              )}
              Submit Report
            </GoldButton>
            <Link
              to="/home"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold"
            >
              <ArrowLeft className="h-4 w-4" /> Cancel
            </Link>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
