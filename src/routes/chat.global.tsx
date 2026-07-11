import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useChannel } from "@/hooks/useChat";
import { ChannelView } from "@/components/chat/ChannelView";

export const Route = createFileRoute("/chat/global")({
  head: () => ({ meta: [{ title: "Global Chat — ChessOx" }] }),
  component: GlobalChat,
});

function GlobalChat() {
  const { data: channel, isLoading } = useChannel("global");

  if (isLoading || !channel) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Link to="/chat" className="flex shrink-0 items-center gap-1.5 border-b border-white/10 px-4 py-2 text-xs text-muted-foreground md:hidden">
        <ArrowLeft className="h-3.5 w-3.5" /> All chats
      </Link>
      <div className="min-h-0 flex-1">
        <ChannelView channel={channel} />
      </div>
    </div>
  );
}
