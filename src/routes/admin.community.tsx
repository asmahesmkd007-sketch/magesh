import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Pin, EyeOff, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { deletePost, moderatePost } from "@/lib/api/adminClient";

export const Route = createFileRoute("/admin/community")({
  head: () => ({ meta: [{ title: "Admin — Community — ChessOx" }] }),
  component: () => (
    <AdminShell title="Community Moderation">
      <CommunityAdmin />
    </AdminShell>
  ),
});

type Post = {
  id: string;
  content: string;
  is_pinned: boolean;
  is_hidden: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
  profiles: { username: string } | null;
};

function CommunityAdmin() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (
      supabase as unknown as {
        from: (n: string) => {
          select: (s: string) => {
            order: (
              c: string,
              o: object,
            ) => { limit: (n: number) => Promise<{ data: unknown[] | null }> };
          };
        };
      }
    )
      .from("community_posts")
      .select(
        "id,content,is_pinned,is_hidden,likes_count,comments_count,created_at,profiles(username)",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    setPosts((data ?? []) as unknown as Post[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {posts.length === 0 && <Card className="p-6 text-sm text-muted-foreground">No posts.</Card>}
      {posts.map((p) => (
        <Card key={p.id} className={`p-4 ${p.is_hidden ? "opacity-50" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="text-gold">@{p.profiles?.username ?? "unknown"}</span>
                <span>{new Date(p.created_at).toLocaleString("en-IN")}</span>
                {p.is_pinned && <span className="text-gold">📌 pinned</span>}
                {p.is_hidden && <span className="text-rose-400">hidden</span>}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm">{p.content}</p>
              <div className="mt-1 text-xs text-muted-foreground">
                {p.likes_count} likes · {p.comments_count} comments
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <IconBtn
                onClick={() =>
                  act(
                    () => moderatePost(p.id, !p.is_pinned, undefined),
                    p.is_pinned ? "Unpinned" : "Pinned",
                  )
                }
              >
                <Pin className="h-3.5 w-3.5" /> {p.is_pinned ? "Unpin" : "Pin"}
              </IconBtn>
              <IconBtn
                onClick={() =>
                  act(
                    () => moderatePost(p.id, undefined, !p.is_hidden),
                    p.is_hidden ? "Shown" : "Hidden",
                  )
                }
              >
                {p.is_hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {p.is_hidden ? "Show" : "Hide"}
              </IconBtn>
              <IconBtn
                tone="rose"
                onClick={() => {
                  if (window.confirm("Delete this post permanently?"))
                    act(() => deletePost(p.id), "Post deleted");
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </IconBtn>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function IconBtn({
  onClick,
  children,
  tone,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: "rose";
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
        tone === "rose"
          ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
          : "border-white/10 text-muted-foreground hover:text-gold"
      }`}
    >
      {children}
    </button>
  );
}
