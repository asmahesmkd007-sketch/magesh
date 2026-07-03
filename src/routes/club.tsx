import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/club")({
  beforeLoad: () => {
    throw redirect({ to: "/clubs" });
  },
  component: () => null,
});
