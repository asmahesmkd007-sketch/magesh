// =====================================================================
// POLICIES HUB — links to every published ChessOX policy page
// =====================================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { listPolicies, POLICY_META, POLICY_TYPES, type Policy } from "@/lib/api/policyClient";

export const Route = createFileRoute("/policies")({
  head: () => ({ meta: [{ title: "Policies — ChessOx" }] }),
  component: PoliciesPage,
});

function PoliciesPage() {
  const [policies, setPolicies] = useState<Record<string, Policy>>({});

  useEffect(() => {
    listPolicies()
      .then((all) => {
        const map: Record<string, Policy> = {};
        for (const p of all) if (p.is_published) map[p.policy_type] = p;
        setPolicies(map);
      })
      .catch(() => setPolicies({}));
  }, []);

  return (
    <PageShell title="Platform Policies">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl mb-3 text-gradient-gold">Policies &amp; Terms</h1>
          <p className="text-muted-foreground leading-relaxed">
            Review our terms of service, privacy policy, and fair play guidelines. We are committed
            to transparency and a safe environment for all players.
          </p>
        </div>
        <div className="space-y-3">
          {POLICY_TYPES.map((t) => {
            const meta = POLICY_META[t];
            const p = policies[t];
            return (
              <Link key={t} to={meta.route} className="block">
                <Card className="flex items-center gap-4 p-5 transition hover:border-gold/30">
                  <span className="text-2xl">{meta.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-lg">{meta.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {p
                        ? `Version ${p.version} · Updated ${new Date(p.updated_at).toLocaleDateString()}`
                        : "Coming soon"}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gold" />
                </Card>
              </Link>
            );
          })}
        </div>
        <div className="mt-8 text-center">
          <Link to="/home">
            <GoldButton>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
            </GoldButton>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
