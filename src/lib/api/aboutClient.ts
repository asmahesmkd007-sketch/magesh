// =====================================================================
// ABOUT CHESS CMS — service layer
// ---------------------------------------------------------------------
// CRUD for about_articles. The cardinal rule of this system: content is
// stored and returned VERBATIM — no trimming, truncation, or rewriting.
// If the about_articles table has not been migrated yet, the client
// degrades gracefully to localStorage so the admin editor keeps working
// (same pattern as the security/settings systems).
// Backend: supabase/migrations_about_chess.sql
// =====================================================================
import { supabase } from "@/integrations/supabase/client";

export type AboutArticle = {
  id: string;
  title: string;
  slug: string;
  content: string;
  category: string;
  tags: string[];
  author_id: string | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const LS_KEY = "chessox_about_articles_v1";

function isMissingTable(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /about_articles|relation .* does not exist|schema cache|404/i.test(msg);
}

// ---- localStorage fallback -------------------------------------------------
function lsRead(): AboutArticle[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as AboutArticle[];
  } catch {
    return [];
  }
}
function lsWrite(rows: AboutArticle[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows));
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `article-${Date.now()}`
  );
}

export function readingTime(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

// ---- queries ---------------------------------------------------------------
export async function listArticles(publishedOnly: boolean): Promise<AboutArticle[]> {
  try {
    let q = supabase
      .from("about_articles" as never)
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (publishedOnly) q = q.eq("is_published" as never, true as never);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as AboutArticle[];
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    const rows = lsRead();
    return publishedOnly ? rows.filter((r) => r.is_published) : rows;
  }
}

export async function saveArticle(input: {
  id?: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  is_published: boolean;
}): Promise<AboutArticle> {
  const { data: auth } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  const row = {
    title: input.title,
    slug: slugify(input.title),
    content: input.content, // stored exactly as submitted — never altered
    category: input.category,
    tags: input.tags,
    is_published: input.is_published,
  };
  try {
    if (input.id) {
      const { data, error } = await supabase
        .from("about_articles" as never)
        .update(row as never)
        .eq("id" as never, input.id as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as AboutArticle;
    }
    const { data, error } = await supabase
      .from("about_articles" as never)
      .insert({ ...row, author_id: auth?.user?.id ?? null } as never)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as AboutArticle;
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    const rows = lsRead();
    const now = new Date().toISOString();
    if (input.id) {
      const i = rows.findIndex((r) => r.id === input.id);
      if (i >= 0) {
        rows[i] = { ...rows[i], ...row, updated_at: now };
        lsWrite(rows);
        return rows[i];
      }
    }
    const created: AboutArticle = {
      id: crypto.randomUUID(),
      ...row,
      author_id: auth?.user?.id ?? null,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    };
    lsWrite([created, ...rows]);
    return created;
  }
}

export async function deleteArticle(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("about_articles" as never)
      .delete()
      .eq("id" as never, id as never);
    if (error) throw error;
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    lsWrite(lsRead().filter((r) => r.id !== id));
  }
}

export async function setPublished(id: string, published: boolean): Promise<void> {
  try {
    const { error } = await supabase
      .from("about_articles" as never)
      .update({ is_published: published } as never)
      .eq("id" as never, id as never);
    if (error) throw error;
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    const rows = lsRead();
    const i = rows.findIndex((r) => r.id === id);
    if (i >= 0) {
      rows[i].is_published = published;
      lsWrite(rows);
    }
  }
}
