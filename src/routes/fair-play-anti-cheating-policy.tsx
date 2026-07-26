import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/fair-play-anti-cheating-policy")({
  head: () =>
    seo({
      title: "Fair Play & Anti-Cheating Policy — ChessOx",
      description:
        "How ChessOx keeps online chess fair: what counts as cheating, how engine assistance and other violations are handled, and the consequences for players who break the rules.",
      path: "/fair-play-anti-cheating-policy",
      jsonLd: [
        webPageLd({
          name: "Fair Play & Anti-Cheating Policy — ChessOx",
          description:
            "The fair play rules that govern rated online chess games and tournaments on ChessOx.",
          path: "/fair-play-anti-cheating-policy",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Policies", path: "/policies" },
          { name: "Fair Play & Anti-Cheating Policy", path: "/fair-play-anti-cheating-policy" },
        ]),
      ],
    }),
  component: () => <PolicyPage type="fair-play" />,
});
