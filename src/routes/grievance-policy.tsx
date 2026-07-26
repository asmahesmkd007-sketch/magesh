import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/grievance-policy")({
  beforeLoad: () => {
    throw redirect({ to: "/contact-grievance-policy" });
  },
});
