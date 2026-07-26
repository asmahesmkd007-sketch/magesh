import { createFileRoute, Outlet } from "@tanstack/react-router";
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
  return (
    <div className="relative h-[calc(100vh-4rem)] overflow-hidden pb-16 lg:pb-0">
      <div className="pointer-events-none absolute inset-0 bg-page" />
      <div className="relative mx-auto grid h-full max-w-7xl grid-cols-1 md:grid-cols-[280px_1fr]">
        <aside className="hidden h-full overflow-hidden border-r border-white/10 md:block">
          <ChatSidebar />
        </aside>
        <main className="min-h-0 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
