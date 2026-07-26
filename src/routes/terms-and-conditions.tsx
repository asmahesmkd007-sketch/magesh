import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/terms-and-conditions")({
  head: () =>
    seo({
      title: "Terms & Conditions — ChessOx",
      description:
        "The terms and conditions that govern the use of ChessOx, including player accounts, online chess games, tournaments and platform conduct.",
      path: "/terms-and-conditions",
      jsonLd: [
        webPageLd({
          name: "Terms & Conditions — ChessOx",
          description:
            "The ChessOx terms of service covering accounts, gameplay, tournaments and acceptable use of the platform.",
          path: "/terms-and-conditions",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Policies", path: "/policies" },
          { name: "Terms & Conditions", path: "/terms-and-conditions" },
        ]),
      ],
    }),
  component: () => <PolicyPage type="terms" />,
});
