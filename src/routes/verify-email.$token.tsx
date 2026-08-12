import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/verify-email/$token")({
  beforeLoad: () => {
    throw redirect({
      to: "/auth",
      search: { mode: "signup" },
    });
  },
});
