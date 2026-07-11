// =====================================================================
// POLICY PAGE — shared public renderer
// ---------------------------------------------------------------------
// Renders one published policy. The full stored text passes through
// ContentRenderer verbatim: every line entered by the admin is
// displayed — never truncated, summarized, or rewritten.
// =====================================================================
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { ContentRenderer } from "@/components/about/ContentRenderer";
import { getPolicy, POLICY_META, type Policy, type PolicyType } from "@/lib/api/policyClient";

export function PolicyPage({ type }: { type: PolicyType }) {
  const meta = POLICY_META[type];
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getPolicy(type)
      .then((p) => setPolicy(p && p.is_published ? p : null))
      .catch(() => setPolicy(null))
      .finally(() => setLoading(false));
  }, [type]);

  return (
    <PageShell title={meta.label}>
      <div className="mx-auto max-w-3xl">
        {loading ? (
          <div className="grid min-h-[40vh] place-items-center">
            <Loader2 className="h-8 w-8 animate-spin text-gold" />
          </div>
        ) : policy ? (
          <Card className="p-6 md:p-10">
            <div className="mb-6 border-b border-white/10 pb-5">
              <div className="mb-2 flex items-center gap-2 text-gold">
                <span className="text-2xl">{meta.icon}</span>
                <span className="text-xs uppercase tracking-[0.25em]">ChessOX Policy</span>
              </div>
              <h1 className="font-display text-3xl md:text-4xl">{policy.title}</h1>
              <p className="mt-2 text-xs text-muted-foreground">
                Version {policy.version} · Last updated{" "}
                {new Date(policy.updated_at).toLocaleDateString()}
              </p>
            </div>
            {/* Full policy text — rendered exactly as entered */}
            <ContentRenderer content={policy.content} />
          </Card>
        ) : (
          <Card className="p-10 text-center">
            <FileText className="mx-auto mb-4 h-10 w-10 text-gold" />
            <h1 className="font-display text-3xl mb-3">{meta.label}</h1>
            <p className="text-sm text-muted-foreground">
              This policy has not been published yet. Please check back soon, or contact{" "}
              <span className="text-gold">contact@chessox.com</span> with any questions.
            </p>
          </Card>
        )}
        <div className="mt-6 text-center">
          <Link to="/policies">
            <GoldButton>
              <ArrowLeft className="h-4 w-4 mr-2" /> All Policies
            </GoldButton>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
