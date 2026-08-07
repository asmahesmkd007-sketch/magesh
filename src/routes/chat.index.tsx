// /chat — the detail pane with nothing selected yet.
//
// This used to carry a second, mobile-only channel list (`md:hidden`) because
// the sidebar rail was `hidden md:block` and therefore unreachable below md.
// That list was built from `useMyChannels()`, so it could only ever show
// channels you had already joined — no public/private room browser, no
// create/join toolbar, no search. The shell now shows the real sidebar
// full-width on mobile instead, so this pane is the desktop empty state only.
import { createFileRoute } from "@tanstack/react-router";
import { ChatEmptyState } from "@/components/chat/ChatSidebar";

export const Route = createFileRoute("/chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  return <ChatEmptyState />;
}
