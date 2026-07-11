import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";

export const Route = createFileRoute("/terms-and-conditions")({
  head: () => ({ meta: [{ title: "Terms & Conditions — ChessOx" }] }),
  component: () => <PolicyPage type="terms" />,
});
