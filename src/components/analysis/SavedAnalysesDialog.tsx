// =====================================================================
// SavedAnalysesDialog — the user's analysis library
// ---------------------------------------------------------------------
// Save the current workspace (new or overwrite), and browse / reopen /
// rename / delete previous ones. Everything lives in the saved_analyses
// table behind owner-only RLS; this dialog is a thin react-query layer
// over savedAnalysisClient.
// =====================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FolderOpen, Loader2, Pencil, Save, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GhostButton, GoldButton } from "@/components/site/Primitives";
import {
  createSavedAnalysis,
  deleteSavedAnalysis,
  listSavedAnalyses,
  loadSavedAnalysis,
  renameSavedAnalysis,
  updateSavedAnalysis,
} from "@/lib/api/savedAnalysisClient";

import type { AnalysisSession } from "./useAnalysisSession";

const QUERY_KEY = ["saved-analyses"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: AnalysisSession;
  /** The saved analysis currently open in the workspace, if any. */
  openSavedId: string | null;
  onOpenedSaved: (id: string, title: string) => void;
};

export function SavedAnalysesDialog({
  open,
  onOpenChange,
  session,
  openSavedId,
  onOpenedSaved,
}: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const list = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listSavedAnalyses(),
    enabled: open,
    retry: 1,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const buildPayload = () => {
    const review = session.reviewState.status === "done" ? session.reviewState.review : null;
    return {
      pgn: session.exportPgn(),
      rootFen: session.tree.rootFen,
      openingName: session.opening?.name ?? null,
      openingEco: session.opening?.eco ?? null,
      accuracyWhite: review?.accuracyWhite ?? null,
      accuracyBlack: review?.accuracyBlack ?? null,
      review: review
        ? {
            depth: review.depth,
            accuracyWhite: review.accuracyWhite,
            accuracyBlack: review.accuracyBlack,
            acplWhite: review.acplWhite,
            acplBlack: review.acplBlack,
            classCountsWhite: review.classCountsWhite,
            classCountsBlack: review.classCountsBlack,
          }
        : null,
    };
  };

  const saveNew = useMutation({
    mutationFn: async () => {
      const id = await createSavedAnalysis({
        title: title.trim() || "Untitled analysis",
        ...buildPayload(),
      });
      return { id, title: title.trim() || "Untitled analysis" };
    },
    onSuccess: ({ id, title: savedTitle }) => {
      toast.success("Analysis saved.");
      onOpenedSaved(id, savedTitle);
      setTitle("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  const overwrite = useMutation({
    mutationFn: async () => {
      if (!openSavedId) throw new Error("Nothing open to overwrite.");
      await updateSavedAnalysis(openSavedId, buildPayload());
    },
    onSuccess: () => {
      toast.success("Analysis updated.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  const openSaved = useMutation({
    mutationFn: loadSavedAnalysis,
    onSuccess: (row) => {
      const result = session.importPgn(row.pgn);
      if (!result.ok) {
        toast.error("This saved analysis could not be parsed — it may be corrupted.");
        return;
      }
      onOpenedSaved(row.id, row.title);
      onOpenChange(false);
      toast.success(`Opened “${row.title}”.`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not load."),
  });

  const rename = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) => renameSavedAnalysis(id, next),
    onSuccess: (_, { id, next }) => {
      setRenamingId(null);
      if (id === openSavedId) onOpenedSaved(id, next);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not rename."),
  });

  const remove = useMutation({
    mutationFn: deleteSavedAnalysis,
    onSuccess: () => {
      toast.success("Analysis deleted.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete."),
  });

  const hasMoves = session.mainline.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-gold/25 bg-background/95 backdrop-blur-xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Analysis library</DialogTitle>
          <DialogDescription>
            Saved analyses keep the full move tree — variations, comments and annotations — plus the
            review summary.
          </DialogDescription>
        </DialogHeader>

        {/* Save current */}
        <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={openSavedId ? "Save a copy as…" : "Name this analysis…"}
              maxLength={120}
              className="min-w-0 flex-1 rounded-md border border-gold/20 bg-white/[0.02] px-2.5 py-1.5 text-sm outline-none focus:border-gold/50"
            />
            <GoldButton onClick={() => saveNew.mutate()} disabled={!hasMoves || saveNew.isPending}>
              <Save className="h-4 w-4" />
              {saveNew.isPending ? "Saving…" : openSavedId ? "Save copy" : "Save"}
            </GoldButton>
          </div>
          {openSavedId && (
            <GhostButton onClick={() => overwrite.mutate()} disabled={overwrite.isPending}>
              {overwrite.isPending ? "Saving…" : "Overwrite the open analysis"}
            </GhostButton>
          )}
          {!hasMoves && (
            <p className="text-[11px] text-muted-foreground">Play or import some moves first.</p>
          )}
        </div>

        {/* Library */}
        <div className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto">
          {list.isLoading && (
            <p className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your analyses…
            </p>
          )}
          {list.isError && (
            <p className="px-1 py-3 text-xs text-muted-foreground">
              Sign in to keep an analysis library.
            </p>
          )}
          {list.data && list.data.length === 0 && (
            <p className="px-1 py-3 text-xs text-muted-foreground">
              Nothing saved yet — analyses you save will appear here on every device.
            </p>
          )}
          {list.data?.map((row) => (
            <div
              key={row.id}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                row.id === openSavedId
                  ? "border-gold/40 bg-gold/5"
                  : "border-white/5 bg-white/[0.02]"
              }`}
            >
              {renamingId === row.id ? (
                <input
                  type="text"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && renameDraft.trim())
                      rename.mutate({ id: row.id, next: renameDraft.trim() });
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="min-w-0 flex-1 rounded border border-gold/40 bg-white/[0.02] px-2 py-1 text-sm outline-none"
                  autoFocus
                  maxLength={120}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => openSaved.mutate(row.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm text-foreground">{row.title}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {row.opening_eco && `${row.opening_eco} · `}
                    {row.opening_name && `${row.opening_name} · `}
                    {row.accuracy_white !== null &&
                      `W ${row.accuracy_white}% / B ${row.accuracy_black}% · `}
                    {new Date(row.updated_at).toLocaleDateString()}
                  </div>
                </button>
              )}
              <button
                type="button"
                onClick={() => openSaved.mutate(row.id)}
                className="rounded p-1.5 text-muted-foreground hover:text-gold"
                title="Open"
                aria-label={`Open ${row.title}`}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setRenamingId(row.id);
                  setRenameDraft(row.title);
                }}
                className="rounded p-1.5 text-muted-foreground hover:text-gold"
                title="Rename"
                aria-label={`Rename ${row.title}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove.mutate(row.id)}
                className="rounded p-1.5 text-muted-foreground hover:text-red-400"
                title="Delete"
                aria-label={`Delete ${row.title}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
