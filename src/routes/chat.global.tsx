import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
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

  // The back-to-list control lives in ChannelView's header (md:hidden) so the
  // conversation doesn't spend a second row of vertical space on it.
  return <ChannelView channel={channel} />;
}
