import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";

export const Route = createFileRoute("/withdrawal-policy")({
  head: () => ({ meta: [{ title: "Withdrawal Policy — ChessOx" }] }),
  component: () => <PolicyPage type="withdrawal" />,
});
