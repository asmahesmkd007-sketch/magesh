// Nested comment thread with unlimited depth, sorting, reactions,
// reply/edit/delete, chess content (FEN/PGN) and @mention links.
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Flag,
  Heart,
  HeartOff,
  Link2,
  Loader2,
  Pencil,
  Reply,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/site/UserAvatar";
import { SeasonShield } from "@/components/ranking/SeasonShield";
import { useAuth } from "@/hooks/useAuth";
import { useCommunityActions, useCommunityComments } from "@/hooks/useCommunity";
import { editComment } from "@/lib/api/communityClient";
import type { CommunityComment } from "@/lib/api/communityClient";
import { isValidFen, isValidPgn } from "@/lib/chess/validation";
import { useQueryClient } from "@tanstack/react-query";
import { FenViewer, PgnViewer } from "./PgnViewer";
import { ReportDialog, RichText, relTime } from "./PostCard";

type SortMode = "top" | "best" | "newest" | "oldest";

type CommentNode = CommunityComment & { children: CommentNode[] };

function buildTree(comments: CommunityComment[], sort: SortMode): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  for (const c of comments) byId.set(c.id, { ...c, children: [] });
  const roots: CommentNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const cmp = (a: CommentNode, b: CommentNode) => {
    switch (sort) {
      case "top":
        return b.likes_count - a.likes_count;
      case "best":
        return b.likes_count - b.dislikes_count - (a.likes_count - a.dislikes_count);
      case "oldest":
        return a.created_at.localeCompare(b.created_at);
      default:
        return b.created_at.localeCompare(a.created_at);
    }
  };
  const sortRec = (nodes: CommentNode[]) => {
    nodes.sort(cmp);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function CommentInput({
  postId,
  parentId,
  onDone,
  autoFocus,
}: {
  postId: string;
  parentId?: string | null;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const { comment } = useCommunityActions();
  const [text, setText] = useState("");
  const [chess, setChess] = useState("");
  const [showChess, setShowChess] = useState(false);

  const submit = () => {
    const content = text.trim();
    if (!content) return;
    let fen: string | null = null;
    let pgn: string | null = null;
    const chessTrim = chess.trim();
    if (chessTrim) {
      if (isValidFen(chessTrim)) fen = chessTrim;
      else if (isValidPgn(chessTrim)) pgn = chessTrim;
      else return toast.error("The chess field is neither a valid FEN nor PGN.");
    }
    comment.mutate(
      { postId, content, parentId, fen, pgn },
      {
        onSuccess: () => {
          setText("");
          setChess("");
          setShowChess(false);
          onDone?.();
        },
      },
    );
  };

  return (
    <div className="flex-1">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={parentId ? "Write a reply…" : "Add a comment…"}
        rows={2}
        maxLength={2000}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
      />
      {showChess && (
        <textarea
          value={chess}
          onChange={(e) => setChess(e.target.value)}
          placeholder="Optional FEN or PGN to attach"
          rows={2}
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 font-mono text-xs outline-none focus:border-gold/40"
        />
      )}
      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowChess((s) => !s)}
          className="text-[11px] text-muted-foreground hover:text-gold"
        >
          {showChess ? "− chess attachment" : "+ chess attachment"}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={comment.isPending || !text.trim()}
          className="ml-auto rounded-full gradient-gold px-4 py-1 text-xs font-medium text-background disabled:opacity-50"
        >
          {comment.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : parentId ? (
            "Reply"
          ) : (
            "Comment"
          )}
        </button>
      </div>
    </div>
  );
}

function CommentItem({
  node,
  postId,
  depth,
}: {
  node: CommentNode;
  postId: string;
  depth: number;
}) {
  const { user } = useAuth();
  const { reactToComment, removeComment, report } = useCommunityActions();
  const queryClient = useQueryClient();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(node.content);
  const [reporting, setReporting] = useState(false);
  const isOwn = user?.id === node.user_id;
  const a = node.author;

  const [localReaction, setLocalReaction] = useState<"like" | "dislike" | null>(() => {
    if (node.my_reaction) return node.my_reaction;
    const saved = typeof window !== "undefined" ? localStorage.getItem(`comment_react_${node.id}_${user?.id}`) : null;
    return (saved as "like" | "dislike" | null) || null;
  });
  const [likesCount, setLikesCount] = useState<number>(node.likes_count);
  const [dislikesCount, setDislikesCount] = useState<number>(node.dislikes_count);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(`comment_react_${node.id}_${user?.id}`) : null;
    setLocalReaction(node.my_reaction || (saved as any) || null);
    setLikesCount(node.likes_count);
    setDislikesCount(node.dislikes_count);
  }, [node.my_reaction, node.likes_count, node.dislikes_count, node.id, user?.id]);

  const handleReaction = (reaction: "like" | "dislike") => {
    if (!user) {
      toast.error("Sign in to react");
      return;
    }
    const prevReaction = localReaction;
    const nextReaction = prevReaction === reaction ? null : reaction;

    let newLikes = likesCount;
    let newDislikes = dislikesCount;

    if (prevReaction === "like") newLikes = Math.max(0, newLikes - 1);
    if (prevReaction === "dislike") newDislikes = Math.max(0, newDislikes - 1);

    if (nextReaction === "like") newLikes += 1;
    if (nextReaction === "dislike") newDislikes += 1;

    setLocalReaction(nextReaction);
    setLikesCount(newLikes);
    setDislikesCount(newDislikes);

    if (typeof window !== "undefined") {
      if (nextReaction) {
        localStorage.setItem(`comment_react_${node.id}_${user.id}`, nextReaction);
      } else {
        localStorage.removeItem(`comment_react_${node.id}_${user.id}`);
      }
    }

    reactToComment.mutate(
      { commentId: node.id, reaction },
      {
        onError: () => {
          setLocalReaction(prevReaction);
          setLikesCount(node.likes_count);
          setDislikesCount(node.dislikes_count);
        },
      },
    );
  };

  const saveEdit = async () => {
    try {
      await editComment(node.id, editText.trim());
      queryClient.invalidateQueries({ queryKey: ["community_comments", postId] });
      setEditing(false);
      toast.success("Comment updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to edit");
    }
  };

  const iconBtn = "flex items-center gap-1 text-[11px] text-muted-foreground hover:text-gold transition-colors";

  return (
    <div className={depth > 0 ? "ml-4 border-l border-white/10 pl-3 sm:ml-6 sm:pl-4" : ""}>
      <div className="flex gap-2.5 py-2.5">
        <Link to="/u/$username" params={{ username: a?.username ?? "" }} className="shrink-0">
          <UserAvatar avatarUrl={a?.avatar_url} displayName={a?.full_name} size="sm" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-xs">
            <Link
              to="/u/$username"
              params={{ username: a?.username ?? "" }}
              className="font-medium hover:underline"
            >
              {a?.full_name ?? "Unknown"}
            </Link>
            {a?.premium_tier && a.premium_tier !== "free" && (
              <BadgeCheck className="h-3.5 w-3.5 text-gold" />
            )}
            <span className="text-muted-foreground">@{a?.username}</span>
            <SeasonShield sp={a?.season_points ?? a?.iq_level ?? 0} size="xs" variant="chip" />
            <span className="text-muted-foreground">· {relTime(node.created_at)}</span>
          </div>
          {editing ? (
            <div className="mt-1.5">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-sm outline-none focus:border-gold/40"
              />
              <div className="mt-1 flex gap-3 text-[11px]">
                <button type="button" className="text-gold" onClick={saveEdit}>
                  Save
                </button>
                <button
                  type="button"
                  className="text-muted-foreground"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1">
              <RichText text={node.content} />
            </div>
          )}
          {node.fen && (
            <div className="mt-2">
              <FenViewer fen={node.fen} />
            </div>
          )}
          {node.pgn && (
            <div className="mt-2">
              <PgnViewer pgn={node.pgn} />
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-3.5">
            <button
              type="button"
              className={`${iconBtn} ${localReaction === "like" ? "!text-rose-400 font-semibold" : ""}`}
              onClick={() => handleReaction("like")}
            >
              <Heart
                className={`h-3.5 w-3.5 transition-transform active:scale-125 ${
                  localReaction === "like" ? "fill-rose-500 text-rose-500" : ""
                }`}
              />
              {likesCount > 0 && likesCount}
            </button>
            <button
              type="button"
              className={`${iconBtn} ${localReaction === "dislike" ? "!text-sky-400 font-semibold" : ""}`}
              onClick={() => handleReaction("dislike")}
            >
              <HeartOff
                className={`h-3.5 w-3.5 transition-transform active:scale-125 ${
                  localReaction === "dislike" ? "fill-sky-400 text-sky-400" : ""
                }`}
              />
              {dislikesCount > 0 && dislikesCount}
            </button>
            <button type="button" className={iconBtn} onClick={() => setReplying((r) => !r)}>
              <Reply className="h-3.5 w-3.5" /> Reply
            </button>
            <button
              type="button"
              className={iconBtn}
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/community/post/${postId}#comment-${node.id}`,
                );
                toast.success("Comment link copied");
              }}
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
            {isOwn && (
              <>
                <button type="button" className={iconBtn} onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className={`${iconBtn} hover:!text-rose-400`}
                  onClick={() => {
                    if (window.confirm("Delete this comment?"))
                      removeComment.mutate({ id: node.id, postId });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {!isOwn && user && (
              <button
                type="button"
                className={`${iconBtn} hover:!text-rose-400`}
                onClick={() => setReporting(true)}
              >
                <Flag className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {replying && user && (
            <div className="mt-2 flex gap-2">
              <CommentInput
                postId={postId}
                parentId={node.id}
                autoFocus
                onDone={() => setReplying(false)}
              />
            </div>
          )}
        </div>
      </div>
      {node.children.map((child) => (
        <CommentItem key={child.id} node={child} postId={postId} depth={depth + 1} />
      ))}
      {reporting && (
        <ReportDialog
          onClose={() => setReporting(false)}
          onSubmit={(reason, details) => {
            report.mutate({ targetType: "comment", targetId: node.id, reason, details });
            setReporting(false);
          }}
        />
      )}
    </div>
  );
}

export function CommentThread({ postId }: { postId: string }) {
  const { user } = useAuth();
  const { data: comments = [], isLoading } = useCommunityComments(postId);
  const [sort, setSort] = useState<SortMode>("top");
  const tree = useMemo(() => buildTree(comments, sort), [comments, sort]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Comments{comments.length > 0 && ` (${comments.length})`}
        </h3>
        <div className="flex gap-1">
          {(["top", "best", "newest", "oldest"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] capitalize ${
                sort === s ? "bg-gold/15 text-gold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {user ? (
        <div className="mt-3 flex gap-2">
          <CommentInput postId={postId} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          <Link to="/login" className="text-gold hover:underline">
            Sign in
          </Link>{" "}
          to join the discussion.
        </p>
      )}
      <div className="mt-2 divide-y divide-white/5">
        {isLoading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
          </div>
        ) : tree.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No comments yet. Be the first!
          </p>
        ) : (
          tree.map((node) => <CommentItem key={node.id} node={node} postId={postId} depth={0} />)
        )}
      </div>
    </div>
  );
}
