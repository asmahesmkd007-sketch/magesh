import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { Card, GoldButton } from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import { useChannel } from "@/hooks/useChat";
import { ChannelView } from "@/components/chat/ChannelView";

export const Route = createFileRoute("/chat/room/$slug")({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} — Chat — ChessOx` }] }),
  component: RoomChat,
});

function RoomChat() {
  const { slug } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const { data: channel, isLoading } = useChannel(slug);

  if (isLoading || authLoading) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="grid h-full place-items-center p-8">
        <Card className="max-w-sm p-8 text-center">
          <Lock className="mx-auto h-8 w-8 text-gold/40" />
          <p className="mt-4 text-sm text-muted-foreground">
            {user
              ? "This room is private, doesn't exist, or you don't have access."
              : "Sign in to view this room."}
          </p>
          {!user && (
            <Link to="/login" className="mt-4 inline-block">
              <GoldButton className="!px-5 !py-2">Sign in</GoldButton>
            </Link>
          )}
        </Card>
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
