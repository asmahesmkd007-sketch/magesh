// =====================================================================
// ADMIN — ABOUT CHESS CMS
// ---------------------------------------------------------------------
// Editor for About Chess articles. Content is stored and published
// EXACTLY as submitted — the editor never trims, truncates, or rewrites
// anything. Features: large rich-text-syntax textarea, auto-saved
// drafts (localStorage, per second), live preview mode, publish /
// unpublish / edit / delete, category + tags. The Information Box at
// the bottom shows the built-in Complete Chess Encyclopedia that always
// renders on the public page.
// =====================================================================
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Eye,
  Loader2,
  Pencil,
  PencilLine,
  Save,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { ContentRenderer } from "@/components/about/ContentRenderer";
import { ChessEncyclopedia } from "@/components/about/ChessEncyclopedia";
import {
  deleteArticle,
  listArticles,
  readingTime,
  saveArticle,
  setPublished,
  type AboutArticle,
} from "@/lib/api/aboutClient";

export const Route = createFileRoute("/admin/about-chess")({
  head: () => ({
    meta: [
      { title: "Admin — About Chess — ChessOx" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell title="About Chess CMS">
      <AboutChessAdmin />
    </AdminShell>
  ),
});

const DRAFT_KEY = "chessox_about_draft_v1";
const PLACEHOLDER =
  "Paste chess information, rules, openings, endgames, player biographies, tournament history, chess lessons, strategies, guides, articles, and educational content here.";

type Draft = {
  id?: string;
  title: string;
  content: string;
  category: string;
  tags: string;
};
const EMPTY: Draft = { title: "", content: "", category: "general", tags: "" };

function AboutChessAdmin() {
  const [articles, setArticles] = useState<AboutArticle[]>([]);
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      return { ...EMPTY, ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") };
    } catch {
      return EMPTY;
    }
  });
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function refresh() {
    try {
      setArticles(await listArticles(false));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load articles");
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  // auto-save the draft to localStorage (debounced)
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setDraftSavedAt(new Date());
    }, 800);
    return () => clearTimeout(timer.current);
  }, [draft]);

  const words = useMemo(
    () => (draft.content.trim() ? draft.content.trim().split(/\s+/).length : 0),
    [draft.content],
  );
  const lineCount = useMemo(() => draft.content.split("\n").length, [draft.content]);

  function validate(): boolean {
    if (!draft.title.trim()) {
      toast.error("Title is required");
      return false;
    }
    if (!draft.content.trim()) {
      toast.error("Content is required — nothing to publish");
      return false;
    }
    return true;
  }

  async function submit(publish: boolean) {
    if (!validate()) return;
    setSaving(true);
    try {
      // Content is passed through verbatim — every line preserved.
      await saveArticle({
        id: draft.id,
        title: draft.title.trim(),
        content: draft.content,
        category: draft.category,
        tags: draft.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        is_published: publish,
      });
      toast.success(
        publish
          ? `Published — all ${lineCount} lines preserved exactly as submitted`
          : "Saved as draft",
      );
      setDraft(EMPTY);
      localStorage.removeItem(DRAFT_KEY);
      setPreview(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  }

  function edit(a: AboutArticle) {
    setDraft({
      id: a.id,
      title: a.title,
      content: a.content,
      category: a.category,
      tags: a.tags.join(", "),
    });
    setPreview(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(a: AboutArticle) {
    if (!confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    try {
      await deleteArticle(a.id);
      toast.success("Article deleted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function togglePublish(a: AboutArticle) {
    try {
      await setPublished(a.id, !a.is_published);
      toast.success(a.is_published ? "Unpublished" : "Published");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* ---- editor ---- */}
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PencilLine className="h-5 w-5 text-gold" />
            <h2 className="font-display text-lg">{draft.id ? "Edit Article" : "New Article"}</h2>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {draftSavedAt && <span>Draft auto-saved {draftSavedAt.toLocaleTimeString()}</span>}
            <button
              onClick={() => setPreview((p) => !p)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${
                preview
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              {preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {preview ? "Back to Editor" : "Preview"}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Article title"
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-gold/40"
          />
          <div className="flex flex-wrap gap-3">
            <select
              value={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
              className="rounded-lg border border-white/10 bg-background px-3 py-2 text-sm outline-none"
            >
              {[
                "general",
                "history",
                "rules",
                "openings",
                "strategy",
                "tactics",
                "players",
                "tournaments",
                "guides",
              ].map((c) => (
                <option key={c} value={c}>
                  {c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <input
              value={draft.tags}
              onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
              placeholder="Tags (comma separated)"
              className="flex-1 rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-gold/40"
            />
          </div>

          {preview ? (
            <div className="min-h-[420px] rounded-lg border border-gold/20 bg-black/20 p-5">
              {draft.title && <h1 className="mb-4 font-display text-3xl">{draft.title}</h1>}
              {draft.content ? (
                <ContentRenderer content={draft.content} />
              ) : (
                <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
              )}
            </div>
          ) : (
            <textarea
              value={draft.content}
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
              placeholder={PLACEHOLDER}
              rows={20}
              className="min-h-[420px] w-full resize-y rounded-lg border border-white/10 bg-transparent px-3 py-2 font-mono text-sm leading-relaxed outline-none focus:border-gold/40"
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {lineCount} line{lineCount === 1 ? "" : "s"} · {words} words · ~
              {readingTime(draft.content || " ")} min read — every line will be published exactly as
              written
            </div>
            <div className="flex gap-2">
              {draft.id && (
                <button
                  onClick={() => {
                    setDraft(EMPTY);
                    localStorage.removeItem(DRAFT_KEY);
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Undo2 className="h-4 w-4" /> Cancel Edit
                </button>
              )}
              <button
                onClick={() => submit(false)}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> Save Draft
              </button>
              <button
                onClick={() => submit(true)}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold hover:bg-gold/20 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Publish
              </button>
            </div>
          </div>
        </div>

        <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-muted-foreground">
          Formatting: <code>#</code>–<code>######</code> headings · <code>-</code> bullets ·{" "}
          <code>1.</code> numbered lists · <code>&gt;</code> quotes · <code>|a|b|</code> tables ·{" "}
          <code>```</code> code blocks · <code>![alt](url)</code> images · <code>@video(url)</code>{" "}
          or a bare YouTube link for videos · <code>[text](url)</code> links · <code>**bold**</code>{" "}
          / <code>*italic*</code>. Plain lines render as paragraphs — nothing is ever skipped,
          summarized, or shortened.
        </p>
      </Card>

      {/* ---- article list ---- */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-lg">Articles ({articles.length})</h2>
        {articles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No articles yet. Write one above — it will appear on the public About Chess page the
            moment you publish it.
          </p>
        ) : (
          <div className="space-y-2">
            {articles.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ivory">{a.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    <span className="capitalize">{a.category}</span> ·{" "}
                    {a.content.split("\n").length} lines · updated{" "}
                    {new Date(a.updated_at).toLocaleString()}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                    a.is_published
                      ? "bg-emerald-400/10 text-emerald-300"
                      : "bg-white/5 text-muted-foreground"
                  }`}
                >
                  {a.is_published ? "Published" : "Draft"}
                </span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => togglePublish(a)}
                    className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs hover:bg-white/5"
                  >
                    {a.is_published ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    onClick={() => edit(a)}
                    className="rounded-lg border border-white/10 p-1.5 hover:bg-white/5"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remove(a)}
                    className="rounded-lg border border-rose-400/20 p-1.5 text-rose-300 hover:bg-rose-400/10"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---- information box: the built-in encyclopedia ---- */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-gold" />
          <h2 className="font-display text-lg">Information Box — Built-in Encyclopedia</h2>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          The following Complete Chess Encyclopedia is permanently published on the public About
          Chess page, below any articles you publish above. It is rendered exactly as authored.
        </p>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 md:p-6">
          <ChessEncyclopedia />
        </div>
      </Card>
    </div>
  );
}
