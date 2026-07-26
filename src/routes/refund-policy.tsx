import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/refund-policy")({
  head: () =>
    seo({
      title: "Refund Policy — ChessOx",
      description:
        "The ChessOx refund policy: when payments for premium memberships and paid tournament entries can be refunded, and how to request a refund.",
      path: "/refund-policy",
      jsonLd: [
        webPageLd({
          name: "Refund Policy — ChessOx",
          description: "Refund eligibility and the refund request process for ChessOx payments.",
          path: "/refund-policy",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Policies", path: "/policies" },
          { name: "Refund Policy", path: "/refund-policy" },
        ]),
      ],
    }),
  component: () => <PolicyPage type="refund" />,
});
