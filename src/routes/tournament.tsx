import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/tournament")({
  beforeLoad: () => {
    throw redirect({ to: "/tournaments" });
  },
  component: () => null,
});
