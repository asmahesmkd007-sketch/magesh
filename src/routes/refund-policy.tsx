import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";

export const Route = createFileRoute("/refund-policy")({
  head: () => ({ meta: [{ title: "Refund Policy — ChessOx" }] }),
  component: () => <PolicyPage type="refund" />,
});
