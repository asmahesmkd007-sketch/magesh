// =====================================================================
// ADMIN — POLICY MANAGEMENT
// ---------------------------------------------------------------------
// One dedicated editor per policy type (Privacy, Terms, Refund,
// Withdrawal, Community, Fair Play). Each policy has its own input box
// and its own auto-saved draft — content added to one policy can never
// overwrite another. Text is stored and published EXACTLY as entered:
// no truncation, summarizing, or rewriting. Every save snapshots the
// previous text into version history, which can be viewed and restored.
// =====================================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, ExternalLink, History, Loader2, Pencil, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import { ContentRenderer } from "@/components/about/ContentRenderer";
import {
  deletePolicy,
  getPolicy,
  listPolicies,
  listPolicyVersions,
  POLICY_META,
  POLICY_TYPES,
  savePolicy,
  setPolicyPublished,
  type Policy,
  type PolicyType,
  type PolicyVersion,
} from "@/lib/api/policyClient";

export const Route = createFileRoute("/admin/policies")({
  head: () => ({
    meta: [
      { title: "Admin — Policies — ChessOx" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell title="Policy Management">
      <PoliciesAdmin />
    </AdminShell>
  ),
});

const PLACEHOLDER =
  "Paste complete policy content here. The content will be published exactly as entered without modification.";
const draftKey = (t: PolicyType) => `chessox_policy_draft_${t}_v1`;

function PoliciesAdmin() {
  const [active, setActive] = useState<PolicyType>("privacy");
  const [statuses, setStatuses] = useState<Record<string, Policy>>({});

  async function refreshStatuses() {
    try {
      const all = await listPolicies();
      const map: Record<string, Policy> = {};
      for (const p of all) map[p.policy_type] = p;
      setStatuses(map);
    } catch {
      /* statuses are cosmetic in the tab strip */
    }
  }
  useEffect(() => {
    refreshStatuses();
  }, []);

  return (
    <div className="max-w-4xl space-y-5">
      {/* policy tabs */}
      <div className="flex flex-wrap gap-2">
        {POLICY_TYPES.map((t) => {
          const p = statuses[t];
          return (
            <button
              key={t}
              onClick={() => setActive(t)}
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm transition ${
                active === t
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{POLICY_META[t].icon}</span>
              {POLICY_META[t].label}
              <span
                className={`h-2 w-2 rounded-full ${
                  p?.is_published ? "bg-emerald-400" : p ? "bg-amber-400" : "bg-white/20"
                }`}
                title={p?.is_published ? "Published" : p ? "Draft" : "Empty"}
              />
            </button>
          );
        })}
      </div>

      {/* Each policy gets its OWN editor instance (own state, own draft key) */}
      <PolicyEditor key={active} type={active} onChanged={refreshStatuses} />
    </div>
  );
}

function PolicyEditor({ type, onChanged }: { type: PolicyType; onChanged: () => void }) {
  const meta = POLICY_META[type];
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState(meta.label);
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [viewVersion, setViewVersion] = useState<PolicyVersion | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // load current policy + any local draft for THIS type only
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await getPolicy(type);
        if (!alive) return;
        setPolicy(p);
        const raw = localStorage.getItem(draftKey(type));
        if (raw) {
          const d = JSON.parse(raw) as { title?: string; content?: string };
          setTitle(d.title || p?.title || meta.label);
          setContent(d.content ?? p?.content ?? "");
        } else {
          setTitle(p?.title ?? meta.label);
          setContent(p?.content ?? "");
        }
        if (p) listPolicyVersions(p.id).then((v) => alive && setVersions(v));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load policy");
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // auto-save draft (per policy type — never touches other policies)
  useEffect(() => {
    if (loading) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      localStorage.setItem(draftKey(type), JSON.stringify({ title, content }));
      setDraftSavedAt(new Date());
    }, 800);
    return () => clearTimeout(timer.current);
  }, [title, content, type, loading]);

  const lineCount = useMemo(() => content.split("\n").length, [content]);
  const words = useMemo(() => (content.trim() ? content.trim().split(/\s+/).length : 0), [content]);

  async function submit(publish: boolean) {
    if (!content.trim()) {
      toast.error("Policy content is empty — nothing to save");
      return;
    }
    setSaving(true);
    try {
      // Content is passed through verbatim — every line preserved.
      const saved = await savePolicy({ type, title: title.trim() || meta.label, content, publish });
      setPolicy(saved);
      localStorage.removeItem(draftKey(type));
      setDraftSavedAt(null);
      listPolicyVersions(saved.id).then(setVersions);
      toast.success(
        publish
          ? `${meta.label} published (v${saved.version}) — all ${lineCount} lines preserved exactly`
          : `${meta.label} saved as draft (v${saved.version})`,
      );
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  }

  async function togglePublish() {
    if (!policy) return;
    try {
      await setPolicyPublished(type, !policy.is_published);
      setPolicy({ ...policy, is_published: !policy.is_published });
      toast.success(policy.is_published ? "Unpublished" : "Published");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function remove() {
    if (!policy) return;
    if (!confirm(`Delete ${meta.label} and its entire version history? This cannot be undone.`))
      return;
    try {
      await deletePolicy(type);
      setPolicy(null);
      setVersions([]);
      setContent("");
      setTitle(meta.label);
      localStorage.removeItem(draftKey(type));
      toast.success(`${meta.label} deleted`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  function restore(v: PolicyVersion) {
    setTitle(v.title);
    setContent(v.content);
    setViewVersion(null);
    setShowHistory(false);
    toast.info(`Loaded v${v.version} into the editor — publish to make it live`);
  }

  if (loading) {
    return (
      <Card className="grid min-h-[300px] place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-gold" />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      {/* header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta.icon}</span>
          <h2 className="font-display text-lg">{meta.label}</h2>
          {policy && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                policy.is_published
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "bg-amber-400/10 text-amber-300"
              }`}
            >
              {policy.is_published ? `Published v${policy.version}` : `Draft v${policy.version}`}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {draftSavedAt && (
            <span className="text-muted-foreground">
              Draft auto-saved {draftSavedAt.toLocaleTimeString()}
            </span>
          )}
          <Link
            to={meta.route}
            target="_blank"
            className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View Page
          </Link>
          <button
            onClick={() => setShowHistory((h) => !h)}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 ${
              showHistory
                ? "border-gold/40 bg-gold/10 text-gold"
                : "border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            <History className="h-3.5 w-3.5" /> History ({versions.length})
          </button>
          <button
            onClick={() => setPreview((p) => !p)}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 ${
              preview
                ? "border-gold/40 bg-gold/10 text-gold"
                : "border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            {preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {preview ? "Editor" : "Preview"}
          </button>
        </div>
      </div>

      {/* version history */}
      {showHistory && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="mb-2 text-sm font-medium text-gold">Version History</h3>
          {versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No previous versions yet. A snapshot is stored every time you save or publish.
            </p>
          ) : (
            <div className="space-y-1.5">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 px-3 py-2 text-xs"
                >
                  <span className="font-mono text-gold">v{v.version}</span>
                  <span className="min-w-0 flex-1 truncate text-ivory/80">{v.title}</span>
                  <span className="text-muted-foreground">
                    {new Date(v.created_at).toLocaleString()} · {v.content.split("\n").length} lines
                  </span>
                  <button
                    onClick={() => setViewVersion(viewVersion?.id === v.id ? null : v)}
                    className="rounded border border-white/10 px-2 py-1 hover:bg-white/5"
                  >
                    {viewVersion?.id === v.id ? "Hide" : "View"}
                  </button>
                  <button
                    onClick={() => restore(v)}
                    className="rounded border border-gold/30 bg-gold/10 px-2 py-1 text-gold hover:bg-gold/20"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
          {viewVersion && (
            <div className="mt-3 max-h-[320px] overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-4">
              <ContentRenderer content={viewVersion.content} />
            </div>
          )}
        </div>
      )}

      {/* editor / preview */}
      <div className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`${meta.label} title`}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-gold/40"
        />
        {preview ? (
          <div className="min-h-[420px] rounded-lg border border-gold/20 bg-black/20 p-5">
            {title && <h1 className="mb-4 font-display text-3xl">{title}</h1>}
            {content ? (
              <ContentRenderer content={content} />
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
            )}
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={22}
            className="min-h-[420px] w-full resize-y rounded-lg border border-white/10 bg-transparent px-3 py-2 font-mono text-sm leading-relaxed outline-none focus:border-gold/40"
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {lineCount} line{lineCount === 1 ? "" : "s"} · {words} words — every line will be
            published exactly as entered
          </div>
          <div className="flex gap-2">
            {policy && (
              <>
                <button
                  onClick={remove}
                  className="flex items-center gap-1.5 rounded-xl border border-rose-400/20 px-3.5 py-2 text-sm text-rose-300 hover:bg-rose-400/10"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
                <button
                  onClick={togglePublish}
                  className="rounded-xl border border-white/15 px-3.5 py-2 text-sm hover:bg-white/5"
                >
                  {policy.is_published ? "Unpublish" : "Publish Current"}
                </button>
              </>
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
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Publish
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
