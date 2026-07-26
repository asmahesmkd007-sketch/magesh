import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/privacy-policy")({
  head: () =>
    seo({
      title: "Privacy Policy — ChessOx",
      description:
        "How ChessOx collects, uses, stores and protects the personal data of chess players using the platform.",
      path: "/privacy-policy",
      jsonLd: [
        webPageLd({
          name: "Privacy Policy — ChessOx",
          description:
            "The ChessOx privacy policy covering data collection, use, storage and player rights.",
          path: "/privacy-policy",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Policies", path: "/policies" },
          { name: "Privacy Policy", path: "/privacy-policy" },
        ]),
      ],
    }),
  component: () => <PolicyPage type="privacy" />,
});
