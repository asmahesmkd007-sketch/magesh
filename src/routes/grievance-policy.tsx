import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";

export const Route = createFileRoute("/grievance-policy")({
  head: () => ({ meta: [{ title: "Contact & Grievance Policy — ChessOx" }] }),
  component: () => <PolicyPage type="grievance" />,
});
