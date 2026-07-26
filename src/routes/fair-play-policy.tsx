import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fair-play-policy")({
  beforeLoad: () => {
    throw redirect({ to: "/fair-play-anti-cheating-policy" });
  },
});
