import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/course/")({
  beforeLoad: () => {
    throw redirect({ to: "/course/$slug", params: { slug: "sicilian-mastery" } });
  },
});
