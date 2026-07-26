import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/contact-grievance-policy")({
  head: () =>
    seo({
      title: "Contact & Grievance Policy — ChessOx",
      description:
        "How to contact ChessOx and raise a grievance: the support channels available to chess players, what to include in a complaint and how issues are escalated and resolved.",
      path: "/contact-grievance-policy",
      jsonLd: [
        webPageLd({
          name: "Contact & Grievance Policy — ChessOx",
          description: "ChessOx support contacts and the grievance redressal process for players.",
          path: "/contact-grievance-policy",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Policies", path: "/policies" },
          { name: "Contact & Grievance Policy", path: "/contact-grievance-policy" },
        ]),
      ],
    }),
  component: () => <PolicyPage type="grievance" />,
});
