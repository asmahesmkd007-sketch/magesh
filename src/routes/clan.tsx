import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/clan")({
  beforeLoad: () => {
    throw redirect({ to: "/clans" });
  },
  component: () => null,
});
