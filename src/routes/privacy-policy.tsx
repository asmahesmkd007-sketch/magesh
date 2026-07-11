import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({ meta: [{ title: "Privacy Policy — ChessOx" }] }),
  component: () => <PolicyPage type="privacy" />,
});
