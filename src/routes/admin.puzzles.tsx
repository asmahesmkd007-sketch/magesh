import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Loader2, Plus, Trash2, Pencil, Upload, Search, Database, X } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card, GoldButton, GhostButton } from "@/components/site/Primitives";
import {
  listPuzzles,
  upsertPuzzle,
  deletePuzzle,
  bulkImportPuzzles,
  setPuzzleEnabled,
  type AdminPuzzle,
} from "@/lib/api/adminClient";
import { PUZZLES, DIFFICULTY_BANDS, difficultyOf } from "@/lib/chess/puzzles";

export const Route = createFileRoute("/admin/puzzles")({
  head: () => ({
    meta: [
      { title: "Admin — Puzzles — ChessOx" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AdminShell title="Puzzle Management">
      <PuzzlesAdmin />
    </AdminShell>
  ),
});

const DIFFICULTIES = DIFFICULTY_BANDS.map((b) => b.label);
const CATEGORIES = Array.from(new Set(PUZZLES.map((p) => p.category))).sort();
type PuzzleForm = Omit<Partial<AdminPuzzle>, "id"> & { id: string | null };
const EMPTY: PuzzleForm = {
  id: null,
  fen: "",
  moves: "",
  rating: 1000,
  theme: "Tactics",
  category: "Tactics",
  goal: "Best move",
  difficulty: "Intermediate",
  explanation: "",
  themes: [],
};

// Client-side legality gate — refuses to save illegal positions / move lines.
function validatePuzzle(fen: string, moves: string): string | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return "Invalid FEN — position is not legal.";
  }
  const list = moves.trim().split(/\s+/).filter(Boolean);
  if (list.length === 0) return "At least one move is required.";
  for (const m of list) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))
      return `Move "${m}" is not valid UCI (e.g. e1e8).`;
    const made = chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] as never });
    if (!made) return `Move "${m}" is illegal in the resulting position.`;
  }
  return null;
}

function PuzzlesAdmin() {
  const [rows, setRows] = useState<AdminPuzzle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [band, setBand] = useState("");
  const [editing, setEditing] = useState<PuzzleForm | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const range = useMemo(() => {
    const b = DIFFICULTY_BANDS.find((x) => x.label === band);
    return b ? [b.min, b.max] : [0, 4000];
  }, [band]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listPuzzles(search, category, range[0], range[1], 200, band));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load puzzles");
    }
    setLoading(false);
  }, [search, category, range, band]);

  async function toggleEnabled(p: AdminPuzzle) {
    try {
      await setPuzzleEnabled(p.id, !p.enabled);
      toast.success(p.enabled ? "Puzzle disabled" : "Puzzle enabled");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  async function save(p: PuzzleForm) {
    const err = validatePuzzle(p.fen ?? "", p.moves ?? "");
    if (err) return toast.error(err);
    try {
      await upsertPuzzle({ ...p, difficulty: difficultyOf(p.rating ?? 1000) ?? "Intermediate" });
      toast.success(p.id ? "Puzzle updated" : "Puzzle created");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this puzzle permanently?")) return;
    try {
      await deletePuzzle(id);
      toast.success("Puzzle deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function seedBundled() {
    if (!window.confirm(`Import all ${PUZZLES.length} verified bundled puzzles into the database?`))
      return;
    try {
      const items = PUZZLES.map((p) => ({
        slug: p.id,
        fen: p.fen,
        moves: p.moves.join(" "),
        rating: p.rating,
        theme: p.theme,
        category: p.category,
        goal: p.goal,
        difficulty: p.difficulty,
        explanation: p.explanation,
        themes: p.themes,
      }));
      const n = await bulkImportPuzzles(items);
      toast.success(`Imported / updated ${n} puzzles`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search FEN or Puzzle ID…"
            className="bg-transparent text-sm outline-none"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c} className="bg-background">
              {c}
            </option>
          ))}
        </select>
        <select
          value={band}
          onChange={(e) => setBand(e.target.value)}
          className="rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">All ratings</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d} className="bg-background">
              {d}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <GhostButton onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Bulk Import
          </GhostButton>
          <GhostButton onClick={seedBundled}>
            <Database className="h-4 w-4" /> Seed Bundled
          </GhostButton>
          <GoldButton onClick={() => setEditing({ ...EMPTY })}>
            <Plus className="h-4 w-4" /> Add Puzzle
          </GoldButton>
        </div>
      </div>

      <Card className="p-0">
        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No puzzles match. Use “Seed Bundled” to populate the database with the verified set.
          </p>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded bg-gold/10 px-1.5 py-0.5 text-xs text-gold">
                      {p.rating}
                    </span>
                    <span className="font-medium">{p.theme}</span>
                    <span className="text-xs text-muted-foreground">· {p.category}</span>
                    {p.enabled === false && (
                      <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-400">
                        Disabled
                      </span>
                    )}
                  </div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground/60">
                    {p.id}
                  </div>
                  <div className="truncate font-mono text-xs text-muted-foreground">{p.fen}</div>
                  <div className="text-xs text-muted-foreground/70">→ {p.moves}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleEnabled(p)}
                    className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs hover:text-gold"
                  >
                    {p.enabled === false ? "Enable" : "Disable"}
                  </button>
                  <button
                    onClick={() => setEditing({ ...p })}
                    className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs hover:text-gold"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-400"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing && <EditModal value={editing} onClose={() => setEditing(null)} onSave={save} />}
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={async () => {
            setImportOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-gold/40";

function EditModal({
  value,
  onClose,
  onSave,
}: {
  value: PuzzleForm;
  onClose: () => void;
  onSave: (p: PuzzleForm) => void;
}) {
  const [p, setP] = useState(value);
  const set = (k: string, v: unknown) => setP((s) => ({ ...s, [k]: v }));
  const preview = validatePuzzle(p.fen ?? "", p.moves ?? "");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl">{p.id ? "Edit Puzzle" : "New Puzzle"}</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="FEN">
            <input
              className={`${inputCls} font-mono`}
              value={p.fen ?? ""}
              onChange={(e) => set("fen", e.target.value)}
              placeholder="6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1"
            />
          </Field>
          <Field label="Moves (UCI, space separated — solver / reply / solver …)">
            <input
              className={`${inputCls} font-mono`}
              value={p.moves ?? ""}
              onChange={(e) => set("moves", e.target.value)}
              placeholder="e1e8"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Theme">
              <input
                className={inputCls}
                value={p.theme ?? ""}
                onChange={(e) => set("theme", e.target.value)}
              />
            </Field>
            <Field label="Category">
              <input
                className={inputCls}
                list="cat-list"
                value={p.category ?? ""}
                onChange={(e) => set("category", e.target.value)}
              />
              <datalist id="cat-list">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Goal">
              <input
                className={inputCls}
                value={p.goal ?? ""}
                onChange={(e) => set("goal", e.target.value)}
                placeholder="Mate in 1"
              />
            </Field>
            <Field label="Rating">
              <input
                type="number"
                className={inputCls}
                value={p.rating ?? 1000}
                onChange={(e) => set("rating", Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label="Explanation">
            <textarea
              className={`${inputCls} min-h-[70px]`}
              value={p.explanation ?? ""}
              onChange={(e) => set("explanation", e.target.value)}
            />
          </Field>
          <Field label="Theme tags (comma separated)">
            <input
              className={inputCls}
              value={(p.themes ?? []).join(", ")}
              onChange={(e) =>
                set(
                  "themes",
                  e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
            />
          </Field>

          {p.fen && p.moves ? (
            preview ? (
              <p className="text-xs text-rose-400">✗ {preview}</p>
            ) : (
              <p className="text-xs text-emerald-400">
                ✓ Legal position, verified move line ({difficultyOf(p.rating ?? 1000)})
              </p>
            )
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <GoldButton onClick={() => onSave(p)} disabled={!!preview}>
            Save
          </GoldButton>
        </div>
      </Card>
    </div>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    let items: unknown[];
    try {
      const parsed = JSON.parse(text);
      items = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return toast.error("Invalid JSON.");
    }
    // Validate each before sending.
    const bad: number[] = [];
    items.forEach((it, i) => {
      const o = it as { fen?: string; moves?: string };
      if (!o.fen || !o.moves || validatePuzzle(o.fen, o.moves)) bad.push(i + 1);
    });
    if (bad.length) return toast.error(`Illegal / incomplete puzzles at index: ${bad.join(", ")}`);
    setBusy(true);
    try {
      const n = await bulkImportPuzzles(items);
      toast.success(`Imported ${n} puzzles`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <Card className="w-full max-w-lg p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl">Bulk Import Puzzles</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          Paste a JSON array. Each item: {"{ fen, moves, rating, theme, category, goal, "}
          {"difficulty, explanation, themes[], slug? }"}. Every position is legality-checked before
          import.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='[{ "fen": "...", "moves": "e1e8", "rating": 820, "theme": "Back Rank Mate" }]'
          className={`${inputCls} min-h-[220px] font-mono`}
        />
        <div className="mt-4 flex justify-end gap-2">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <GoldButton onClick={run} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import
          </GoldButton>
        </div>
      </Card>
    </div>
  );
}
