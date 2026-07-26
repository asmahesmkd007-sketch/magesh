import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/clubs")({
  beforeLoad: () => {
    throw redirect({
      to: "/clans",
    });
  },
});
