import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";

export const Route = createFileRoute("/fair-play-policy")({
  head: () => ({ meta: [{ title: "Fair Play Policy — ChessOx" }] }),
  component: () => <PolicyPage type="fair-play" />,
});
