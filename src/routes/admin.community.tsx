// Admin — Community: live stats, post moderation (pin/hide/delete),
// report queue (resolve/dismiss). Server-side gated by is_admin RPCs.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, Pin, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card, Stat } from "@/components/site/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { deletePost, moderatePost } from "@/lib/api/adminClient";
import {
  fetchCommunityStats,
  fetchReports,
  resolveReport,
  type CommunityReport,
  type CommunityStats,
} from "@/lib/api/communityClient";

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
  post_type: string;
  is_pinned: boolean;
  is_hidden: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
  profiles: { username: string } | null;
};

function CommunityAdmin() {
  const [tab, setTab] = useState<"posts" | "reports">("posts");
  const [stats, setStats] = useState<CommunityStats | null>(null);

  useEffect(() => {
    fetchCommunityStats().then(setStats).catch(() => setStats(null));
  }, []);

  return (
    <div className="space-y-5">
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Users" value={stats.users} hint={`${stats.online} online`} />
          <Stat label="Posts" value={stats.posts} hint={`${stats.posts_7d} this week`} />
          <Stat label="Comments" value={stats.comments} hint={`${stats.likes} likes`} />
          <Stat label="Open Reports" value={stats.open_reports} hint={`${stats.follows} follows`} />
        </div>
      )}
      <div className="flex gap-2">
        {(["posts", "reports"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-1.5 text-xs capitalize ${
              tab === t
                ? "border-gold/50 bg-gold/10 text-gold"
                : "border-white/10 text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "posts" ? <PostsPanel /> : <ReportsPanel />}
    </div>
  );
}

function PostsPanel() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("community_posts")
      .select(
        "id,content,post_type,is_pinned,is_hidden,likes_count,comments_count,created_at,profiles(username)",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    setPosts((data ?? []) as Post[]);
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

  if (loading)
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );

  return (
    <div className="space-y-3">
      {posts.length === 0 && <Card className="p-6 text-sm text-muted-foreground">No posts.</Card>}
      {posts.map((p) => (
        <Card key={p.id} className={`p-4 ${p.is_hidden ? "opacity-50" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="text-gold">@{p.profiles?.username ?? "unknown"}</span>
                <span className="rounded bg-white/5 px-1.5 text-[10px]">{p.post_type}</span>
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
                  act(() => moderatePost(p.id, !p.is_pinned, undefined), p.is_pinned ? "Unpinned" : "Pinned")
                }
              >
                <Pin className="h-3.5 w-3.5" /> {p.is_pinned ? "Unpin" : "Pin"}
              </IconBtn>
              <IconBtn
                onClick={() =>
                  act(() => moderatePost(p.id, undefined, !p.is_hidden), p.is_hidden ? "Shown" : "Hidden")
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

function ReportsPanel() {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await fetchReports(filter === "open" ? "open" : undefined));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load reports");
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id: string, status: "resolved" | "dismissed") {
    try {
      await resolveReport(id, status);
      toast.success(status === "resolved" ? "Report resolved" : "Report dismissed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  if (loading)
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["open", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-[11px] capitalize ${
              filter === f ? "border-gold/50 text-gold" : "border-white/10 text-muted-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      {reports.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">No reports. 🎉</Card>
      )}
      {reports.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-rose-500/15 px-2 py-0.5 capitalize text-rose-300">
                  {r.reason.replace("_", " ")}
                </span>
                <span className="rounded bg-white/5 px-2 py-0.5 text-muted-foreground">
                  {r.target_type}
                </span>
                <span
                  className={`rounded px-2 py-0.5 capitalize ${
                    r.status === "open"
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-white/5 text-muted-foreground"
                  }`}
                >
                  {r.status}
                </span>
                <span className="text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("en-IN")}
                </span>
              </div>
              {r.details && <p className="mt-1.5 text-xs text-muted-foreground">{r.details}</p>}
              {r.target_type === "post" && (
                <a
                  href={`/community/post/${r.target_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-gold hover:underline"
                >
                  View reported post →
                </a>
              )}
            </div>
            {r.status === "open" && (
              <div className="flex shrink-0 flex-col gap-1.5">
                <IconBtn onClick={() => resolve(r.id, "resolved")}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
                </IconBtn>
                <IconBtn onClick={() => resolve(r.id, "dismissed")}>
                  <XCircle className="h-3.5 w-3.5" /> Dismiss
                </IconBtn>
              </div>
            )}
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
