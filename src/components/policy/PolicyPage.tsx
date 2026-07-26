// =====================================================================
// POLICY PAGE — shared public renderer
// ---------------------------------------------------------------------
// Renders one published policy. The full stored text passes through
// ContentRenderer verbatim: every line entered by the admin is
// displayed — never truncated, summarized, or rewritten.
// =====================================================================
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileText, Loader2, Info } from "lucide-react";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { ContentRenderer } from "@/components/about/ContentRenderer";
import { getPolicy, POLICY_META, type Policy, type PolicyType } from "@/lib/api/policyClient";
import { getPolicyFallback, POLICY_FALLBACK_NOTE } from "@/lib/policyFallbacks";

export function PolicyPage({ type }: { type: PolicyType }) {
  const meta = POLICY_META[type];
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);

  // A published row always wins. The built-in document is only used when the
  // database has nothing to show — an unpublished row, or an anonymous visitor
  // whose read is refused — so a policy page is never a dead end.
  const doc = policy ?? getPolicyFallback(type);

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
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-5 text-xs text-muted-foreground">
          <Link to="/" className="transition-colors hover:text-gold">
            Home
          </Link>
          <span className="mx-2 text-gold/40">{">"}</span>
          <span className="text-gold">{meta.label}</span>
        </nav>
        {loading ? (
          <div className="grid min-h-[40vh] place-items-center">
            <Loader2 className="h-8 w-8 animate-spin text-gold" />
          </div>
        ) : doc ? (
          <Card className="p-6 md:p-10">
            <div className="mb-6 border-b border-white/10 pb-5">
              <div className="mb-2 flex items-center gap-2 text-gold">
                <span className="text-2xl">{meta.icon}</span>
                <span className="text-xs uppercase tracking-[0.25em]">ChessOX Policy</span>
              </div>
              {/* h2 — PageShell above already renders this page's h1. */}
              <h2 className="font-display text-3xl md:text-4xl">{doc.title}</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                {policy ? (
                  <>
                    Version {policy.version} · Last updated{" "}
                    {new Date(policy.updated_at).toLocaleDateString()}
                  </>
                ) : (
                  POLICY_FALLBACK_NOTE
                )}
              </p>
            </div>
            {/* Information box — full policy text, rendered exactly as entered */}
            <div className="rounded-2xl border border-gold/20 bg-white/[0.02] p-5 md:p-6">
              <div className="mb-4 flex items-center gap-2 text-gold">
                <Info className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.25em]">
                  Information
                </span>
              </div>
              <ContentRenderer content={doc.content} />
            </div>
          </Card>
        ) : (
          <Card className="p-10 text-center">
            <FileText className="mx-auto mb-4 h-10 w-10 text-gold" />
            <h2 className="font-display text-3xl mb-3">{meta.label}</h2>
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
