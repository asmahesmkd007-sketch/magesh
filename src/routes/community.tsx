import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CommunityLayout } from "@/components/community/CommunityLayout";
import { useCommunityRealtime } from "@/hooks/useCommunity";

export const Route = createFileRoute("/community")({
  head: () => ({ meta: [{ title: "Community — ChessOx" }] }),
  component: CommunityShell,
});

function CommunityShell() {
  useCommunityRealtime();
  return (
    <CommunityLayout>
      <Outlet />
    </CommunityLayout>
  );
}
