// Direct message thread with @username. Resolves the profile, then
// get-or-creates the DM channel (server-side dedup + block check).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, GoldButton } from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import * as api from "@/lib/api/chatClient";
import { ChannelView } from "@/components/chat/ChannelView";

export const Route = createFileRoute("/chat/dm/$username")({
  head: ({ params }) => ({ meta: [{ title: `@${params.username} — Chat — ChessOx` }] }),
  component: DmChat,
});

function DmChat() {
  const { username } = Route.useParams();
  const { user, loading: authLoading } = useAuth();

  const { data: otherId, isLoading: profileLoading } = useQuery({
    queryKey: ["dm_target_profile", username],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
      return (data as { id: string } | null)?.id ?? null;
    },
  });

  const { data: channel, isLoading: channelLoading, error } = useQuery({
    queryKey: ["chat_dm", otherId],
    queryFn: () => api.getOrCreateDm(otherId!),
    enabled: !!otherId && !!user,
  });

  if (authLoading || (user && (profileLoading || channelLoading))) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="grid h-full place-items-center p-8">
        <Card className="max-w-sm p-8 text-center">
          <p className="text-sm text-muted-foreground">Sign in to send direct messages.</p>
          <Link to="/login" className="mt-4 inline-block">
            <GoldButton className="!px-5 !py-2">Sign in</GoldButton>
          </Link>
        </Card>
      </div>
    );
  }

  if (!otherId || error || !channel) {
    return (
      <div className="grid h-full place-items-center p-8">
        <Card className="max-w-sm p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : `No player named @${username} found.`}
          </p>
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
