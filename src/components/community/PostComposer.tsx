// Post composer: text + optional image upload, FEN board, PGN game,
// puzzle (FEN + solution), poll, link. Validates chess content with
// chess.js before allowing submit.
import { useRef, useState } from "react";
import {
  BarChart3,
  Grid3x3,
  ImagePlus,
  Lightbulb,
  Link2,
  Loader2,
  ScrollText,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, GoldButton } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { useCommunityActions } from "@/hooks/useCommunity";
import { isValidFen, isValidPgn } from "@/lib/chess/validation";
import { uploadCommunityImage } from "@/lib/api/communityClient";
import type { NewPost, PostType } from "@/lib/api/communityClient";
import { MiniBoard } from "./MiniBoard";

type Attachment = "none" | "image" | "fen" | "pgn" | "puzzle" | "poll" | "link";

const FLAVORS: { value: PostType; label: string }[] = [
  { value: "text", label: "Post" },
  { value: "analysis", label: "Analysis" },
  { value: "question", label: "Question" },
  { value: "opening", label: "Opening" },
  { value: "tournament", label: "Tournament" },
  { value: "news", label: "News" },
  { value: "meme", label: "Meme" },
];

export function PostComposer({ onPosted }: { onPosted?: () => void }) {
  const { user } = useAuth();
  const { profile } = useProfile(user?.id);
  const { createPost } = useCommunityActions();
  const fileRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState("");
  const [flavor, setFlavor] = useState<PostType>("text");
  const [attachment, setAttachment] = useState<Attachment>("none");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fen, setFen] = useState("");
  const [pgn, setPgn] = useState("");
  const [solution, setSolution] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [tagsInput, setTagsInput] = useState("");

  if (!user) return null;

  const reset = () => {
    setContent("");
    setFlavor("text");
    setAttachment("none");
    setMediaUrl(null);
    setFen("");
    setPgn("");
    setSolution("");
    setLinkUrl("");
    setPollOptions(["", ""]);
    setTagsInput("");
  };

  const pickAttachment = (a: Attachment) => {
    setAttachment((cur) => (cur === a ? "none" : a));
    if (a !== "image") setMediaUrl(null);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      setMediaUrl(await uploadCommunityImage(user.id, file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    const text = content.trim();
    const tags = tagsInput
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, "").trim())
      .filter(Boolean)
      .slice(0, 5);

    const post: NewPost = { post_type: flavor, content: text, tags };

    if (attachment === "image") {
      if (!mediaUrl) return toast.error("Add an image or remove the attachment.");
      post.media_url = mediaUrl;
      post.post_type = flavor === "text" ? "image" : flavor;
    } else if (attachment === "fen") {
      if (!isValidFen(fen)) return toast.error("Invalid FEN position.");
      post.fen = fen.trim();
      post.post_type = flavor === "text" ? "fen" : flavor;
    } else if (attachment === "pgn") {
      if (!isValidPgn(pgn)) return toast.error("Invalid PGN.");
      post.pgn = pgn.trim();
      post.post_type = flavor === "text" ? "pgn" : flavor;
    } else if (attachment === "puzzle") {
      if (!isValidFen(fen)) return toast.error("Invalid puzzle FEN.");
      post.fen = fen.trim();
      post.puzzle_solution = solution.trim() || null;
      post.post_type = "puzzle";
    } else if (attachment === "poll") {
      const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) return toast.error("A poll needs at least two options.");
      post.poll_options = opts.slice(0, 6);
      post.post_type = "poll";
    } else if (attachment === "link") {
      if (!/^https?:\/\/.+/.test(linkUrl.trim())) return toast.error("Enter a valid URL.");
      post.link_url = linkUrl.trim();
      post.post_type = flavor === "text" ? "link" : flavor;
    }

    if (!text && attachment === "none") return toast.error("Write something first.");
    createPost.mutate(post, {
      onSuccess: () => {
        reset();
        onPosted?.();
      },
    });
  };

  const toolBtn = (a: Attachment, Icon: React.ComponentType<{ className?: string }>, label: string) => (
    <button
      type="button"
      title={label}
      onClick={() => pickAttachment(a)}
      className={`grid h-9 w-9 place-items-center rounded-full transition ${
        attachment === a ? "bg-gold/20 text-gold" : "text-muted-foreground hover:bg-white/[0.05] hover:text-gold"
      }`}
    >
      <Icon className="h-4.5 w-4.5" />
    </button>
  );

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex gap-3">
        <UserAvatar avatarUrl={profile?.avatar_url} displayName={profile?.full_name} size="md" />
        <div className="min-w-0 flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share a position, a question, a victory…"
            rows={content ? 3 : 2}
            maxLength={4000}
            className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-gold/40"
          />

          {/* flavor chips */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FLAVORS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFlavor(f.value)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                  flavor === f.value
                    ? "border-gold/50 bg-gold/10 text-gold"
                    : "border-white/10 text-muted-foreground hover:border-gold/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* attachment editors */}
          {attachment === "image" && (
            <div className="mt-3">
              {mediaUrl ? (
                <div className="relative inline-block">
                  <img src={mediaUrl} alt="" className="max-h-64 rounded-xl border border-white/10" />
                  <button
                    type="button"
                    onClick={() => setMediaUrl(null)}
                    className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-black/80 text-white"
                    aria-label="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-3 text-xs text-muted-foreground hover:border-gold/40 hover:text-gold"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {uploading ? "Uploading…" : "Choose image (max 5 MB)"}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          )}
          {(attachment === "fen" || attachment === "puzzle") && (
            <div className="mt-3 space-y-2">
              <input
                value={fen}
                onChange={(e) => setFen(e.target.value)}
                placeholder="Paste FEN — e.g. rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-xs outline-none focus:border-gold/40"
              />
              {attachment === "puzzle" && (
                <input
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                  placeholder="Solution moves in SAN, space separated — e.g. Qh5+ g6 Qxg6#"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-xs outline-none focus:border-gold/40"
                />
              )}
              {fen.trim() &&
                (isValidFen(fen) ? (
                  <MiniBoard fen={fen} className="max-w-[220px]" />
                ) : (
                  <div className="text-xs text-rose-400">Invalid FEN</div>
                ))}
            </div>
          )}
          {attachment === "pgn" && (
            <div className="mt-3">
              <textarea
                value={pgn}
                onChange={(e) => setPgn(e.target.value)}
                placeholder={'Paste PGN — e.g. 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 …'}
                rows={4}
                className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-xs outline-none focus:border-gold/40"
              />
              {pgn.trim() && !isValidPgn(pgn) && (
                <div className="mt-1 text-xs text-rose-400">Invalid PGN</div>
              )}
            </div>
          )}
          {attachment === "poll" && (
            <div className="mt-3 space-y-1.5">
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={opt}
                    onChange={(e) =>
                      setPollOptions((os) => os.map((o, j) => (j === i ? e.target.value : o)))
                    }
                    maxLength={80}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs outline-none focus:border-gold/40"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setPollOptions((os) => os.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-rose-400"
                      aria-label="Remove option"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button
                  type="button"
                  onClick={() => setPollOptions((os) => [...os, ""])}
                  className="text-xs text-gold hover:underline"
                >
                  + Add option
                </button>
              )}
            </div>
          )}
          {attachment === "link" && (
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
              className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs outline-none focus:border-gold/40"
            />
          )}

          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Tags (comma separated, up to 5) — najdorf, endgame…"
            className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground/70 focus:border-gold/40"
          />

          {/* toolbar */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              {toolBtn("image", ImagePlus, "Image")}
              {toolBtn("fen", Grid3x3, "FEN position")}
              {toolBtn("pgn", ScrollText, "PGN game")}
              {toolBtn("puzzle", Lightbulb, "Puzzle")}
              {toolBtn("poll", BarChart3, "Poll")}
              {toolBtn("link", Link2, "Link")}
            </div>
            <div className="flex items-center gap-3">
              {content.length > 3600 && (
                <span className="text-[11px] text-muted-foreground">{4000 - content.length}</span>
              )}
              <GoldButton
                onClick={submit}
                disabled={createPost.isPending || uploading}
                className="!px-6 !py-2 disabled:opacity-60"
              >
                {createPost.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
              </GoldButton>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
