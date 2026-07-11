import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";

export const Route = createFileRoute("/community-policy")({
  head: () => ({ meta: [{ title: "Community Policy — ChessOx" }] }),
  component: () => <PolicyPage type="community" />,
});
