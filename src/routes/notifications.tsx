import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { useEffect, useState } from "react";
import {
  Bell,
  CheckCheck,
  Loader2,
  Trophy,
  UserPlus,
  Users,
  Flame,
  Swords,
  Info,
  Heart,
  MessageCircle,
  AtSign,
  Mail,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — ChessOx" }] }),
  component: Notifs,
});

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function kindIcon(kind: string) {
  switch (kind) {
    case "tournament":
      return Trophy;
    case "achievement":
      return Trophy;
    case "friend_request":
    case "follow":
      return UserPlus;
    case "like":
      return Heart;
    case "comment":
    case "reply":
      return MessageCircle;
    case "mention":
    case "chat_mention":
      return AtSign;
    case "dm":
      return Mail;
    case "room_invite":
      return UserPlus;
    case "club":
      return Users;
    case "puzzle":
    case "streak":
      return Flame;
    case "challenge":
      return Swords;
    default:
      return Info;
  }
}

function Notifs() {
  const { user, loading: authLoading } = useAuth();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => {
        setNotifs((data ?? []) as Notif[]);
        setLoading(false);
      });
  }, [user, authLoading]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notifs:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (p) => {
          setNotifs((prev) => [p.new as Notif, ...prev]);
          toast.info((p.new as Notif).title);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  async function markRead(id: string) {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase
      .from("notifications")
      .update({ read: true } as never)
      .eq("id", id);
  }

  async function markAllRead() {
    if (!user) return;
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase
      .from("notifications")
      .update({ read: true } as never)
      .eq("user_id", user.id)
      .eq("read", false);
    toast.success("All marked as read");
  }

  const unreadCount = notifs.filter((n) => !n.read).length;

  if (!authLoading && !user) {
    return (
      <PageShell eyebrow="Inbox" title="Notifications">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Sign in to view your notifications.</p>
          <div className="mt-4">
            <Link to="/auth">
              <GoldButton>Sign in</GoldButton>
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Inbox"
      title="Notifications"
      action={
        unreadCount > 0 ? (
          <button
            onClick={markAllRead}
            className="flex items-center gap-2 rounded-full border border-gold/30 px-4 py-2 text-sm text-gold hover:bg-gold/10"
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        ) : undefined
      }
    >
      {loading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : notifs.length === 0 ? (
        <Card className="p-10 text-center">
          <Bell className="mx-auto h-10 w-10 text-gold/30" />
          <p className="mt-4 text-muted-foreground">
            No notifications yet. Play games and join clubs to get updates!
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifs.map((n) => {
            const Icon = kindIcon(n.kind);
            const inner = (
              <div
                key={n.id}
                onClick={() => !n.read && markRead(n.id)}
                className={`flex items-start gap-4 rounded-2xl border p-4 transition cursor-pointer hover:bg-white/[0.03] ${!n.read ? "border-gold/20 bg-gold/[0.03]" : "border-white/5"}`}
              >
                <span
                  className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full ${!n.read ? "gradient-gold text-[#0B0D10]" : "bg-white/5 text-muted-foreground"}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${!n.read ? "font-medium" : ""}`}>{n.title}</div>
                  {n.body && <div className="mt-0.5 text-xs text-muted-foreground">{n.body}</div>}
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {relTime(n.created_at)}
                </div>
                {!n.read && <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold" />}
              </div>
            );
            return n.link ? (
              <Link key={n.id} to={n.link as never}>
                {inner}
              </Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
