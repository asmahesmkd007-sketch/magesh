import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CommunityLayout } from "@/components/community/CommunityLayout";
import { useCommunityRealtime } from "@/hooks/useCommunity";
import { RequireAuth } from "@/components/auth/RequireAuth";

export const Route = createFileRoute("/community")({
  head: () => ({ meta: [{ title: "Community — ChessOx" }] }),
  component: CommunityShell,
});

function CommunityShell() {
  useCommunityRealtime();
  return (
    <RequireAuth>
      <CommunityLayout>
        <Outlet />
      </CommunityLayout>
    </RequireAuth>
  );
}
