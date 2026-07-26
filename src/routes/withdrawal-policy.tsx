import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/withdrawal-policy")({
  head: () =>
    seo({
      title: "Withdrawal Policy — ChessOx",
      description:
        "The ChessOx withdrawal policy: how players withdraw winnings from their wallet, the verification required and the processing timelines that apply.",
      path: "/withdrawal-policy",
      jsonLd: [
        webPageLd({
          name: "Withdrawal Policy — ChessOx",
          description:
            "Wallet withdrawal rules, verification requirements and processing timelines on ChessOx.",
          path: "/withdrawal-policy",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Policies", path: "/policies" },
          { name: "Withdrawal Policy", path: "/withdrawal-policy" },
        ]),
      ],
    }),
  component: () => <PolicyPage type="withdrawal" />,
});
