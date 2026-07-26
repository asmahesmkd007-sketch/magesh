import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/community-policy")({
  head: () =>
    seo({
      title: "Community Policy — ChessOx",
      description:
        "The ChessOx community policy: the standards of behaviour expected from chess players in chat, clubs, the community feed and every other shared space on the platform.",
      path: "/community-policy",
      jsonLd: [
        webPageLd({
          name: "Community Policy — ChessOx",
          description: "Behaviour standards and moderation rules for the ChessOx chess community.",
          path: "/community-policy",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Policies", path: "/policies" },
          { name: "Community Policy", path: "/community-policy" },
        ]),
      ],
    }),
  component: () => <PolicyPage type="community" />,
});
