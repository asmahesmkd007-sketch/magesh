// =====================================================================
// SAVED ANALYSES SERVICE LAYER (client)
// ---------------------------------------------------------------------
// CRUD for the user's analysis workspaces (saved_analyses table). Each
// row stores the annotated PGN (variations, comments, NAGs) plus an
// optional review summary so reopening a study restores everything.
// RLS restricts every operation to the owner; this module just shapes
// the queries and validates input sizes client-side for fast feedback.
// =====================================================================
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

export type SavedAnalysis = {
  id: string;
  title: string;
  pgn: string;
  root_fen: string;
  game_id: string | null;
  opening_name: string | null;
  opening_eco: string | null;
  accuracy_white: number | null;
  accuracy_black: number | null;
  review: unknown | null;
  created_at: string;
  updated_at: string;
};

export type SavedAnalysisSummary = Omit<SavedAnalysis, "pgn" | "review">;

const titleSchema = z.string().trim().min(1, "Give the analysis a name.").max(120);
const pgnSchema = z.string().max(200_000, "This PGN is too large to save.");

const LIST_COLS =
  "id,title,root_fen,game_id,opening_name,opening_eco,accuracy_white,accuracy_black,created_at,updated_at";

// The generated Supabase types predate saved_analyses; the `as never`
// table cast is the same pattern the wallet/analysis clients use.
type AnyRow = Record<string, unknown>;

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in to save analyses.");
  return data.user.id;
}

/** The user's saved analyses, most recently touched first. */
export async function listSavedAnalyses(limit = 50): Promise<SavedAnalysisSummary[]> {
  const { data, error } = await supabase
    .from("saved_analyses" as never)
    .select(LIST_COLS)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SavedAnalysisSummary[];
}

/** Load one saved analysis in full (PGN + review). */
export async function loadSavedAnalysis(id: string): Promise<SavedAnalysis> {
  const { data, error } = await supabase
    .from("saved_analyses" as never)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Analysis not found — it may have been deleted.");
  return data as unknown as SavedAnalysis;
}

export type SaveAnalysisInput = {
  title: string;
  pgn: string;
  rootFen: string;
  gameId?: string | null;
  openingName?: string | null;
  openingEco?: string | null;
  accuracyWhite?: number | null;
  accuracyBlack?: number | null;
  review?: unknown | null;
};

/** Create a new saved analysis; returns its id. */
export async function createSavedAnalysis(input: SaveAnalysisInput): Promise<string> {
  const userId = await requireUserId();
  const row: AnyRow = {
    user_id: userId,
    title: titleSchema.parse(input.title),
    pgn: pgnSchema.parse(input.pgn),
    root_fen: input.rootFen,
    game_id: input.gameId ?? null,
    opening_name: input.openingName ?? null,
    opening_eco: input.openingEco ?? null,
    accuracy_white: input.accuracyWhite ?? null,
    accuracy_black: input.accuracyBlack ?? null,
    review: input.review ?? null,
  };
  const { data, error } = await supabase
    .from("saved_analyses" as never)
    .insert(row as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as unknown as { id: string }).id;
}

/** Overwrite an existing saved analysis's content. */
export async function updateSavedAnalysis(
  id: string,
  input: Partial<SaveAnalysisInput>,
): Promise<void> {
  const row: AnyRow = {};
  if (input.title !== undefined) row.title = titleSchema.parse(input.title);
  if (input.pgn !== undefined) row.pgn = pgnSchema.parse(input.pgn);
  if (input.rootFen !== undefined) row.root_fen = input.rootFen;
  if (input.openingName !== undefined) row.opening_name = input.openingName;
  if (input.openingEco !== undefined) row.opening_eco = input.openingEco;
  if (input.accuracyWhite !== undefined) row.accuracy_white = input.accuracyWhite;
  if (input.accuracyBlack !== undefined) row.accuracy_black = input.accuracyBlack;
  if (input.review !== undefined) row.review = input.review;
  if (Object.keys(row).length === 0) return;

  const { error } = await supabase
    .from("saved_analyses" as never)
    .update(row as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Rename only (dashboard quick action). */
export async function renameSavedAnalysis(id: string, title: string): Promise<void> {
  await updateSavedAnalysis(id, { title });
}

export async function deleteSavedAnalysis(id: string): Promise<void> {
  const { error } = await supabase
    .from("saved_analyses" as never)
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
