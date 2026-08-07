import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/chat")({
  head: () =>
    noindexSeo(
      "Chess Chat — ChessOx",
      "Chat with other chess players on ChessOx in global chat, chess rooms and direct messages.",
      "noindex, nofollow",
    ),
  component: ChatShell,
});

function ChatShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Below md the two columns don't fit side by side, so the shell becomes a
  // master/detail stack: /chat is the room list, any deeper route is the
  // conversation (which renders its own back link). At md and up both panes
  // are shown exactly as before. The sidebar stays a single mounted instance
  // in both layouts — `useMyChannelsRealtime` opens a Supabase channel keyed
  // on the user id, so a second copy would collide with the first.
  const showList = pathname === "/chat" || pathname === "/chat/";

  return (
    <div className="app-pane-h relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-page" />
      <div className="relative mx-auto grid h-full max-w-7xl grid-cols-1 md:grid-cols-[280px_1fr]">
        <aside
          className={`${showList ? "block" : "hidden"} h-full min-h-0 overflow-hidden border-r border-white/10 md:block`}
        >
          <ChatSidebar />
        </aside>
        <main className={`${showList ? "hidden" : "block"} min-h-0 overflow-hidden md:block`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
