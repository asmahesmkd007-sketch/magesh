// =====================================================================
// POLICY MANAGEMENT — service layer
// ---------------------------------------------------------------------
// One policy row per type; every save snapshots the previous text into
// policy_versions. The cardinal rule: policy text is stored and
// returned VERBATIM — no trimming, truncation, or rewriting. Falls
// back to localStorage if the tables are missing (same pattern as
// aboutClient). Backend: supabase/migrations_policies.sql
// =====================================================================
import { supabase } from "@/integrations/supabase/client";

export const POLICY_TYPES = [
  "privacy",
  "terms",
  "refund",
  "withdrawal",
  "community",
  "fair-play",
  "grievance",
] as const;
export type PolicyType = (typeof POLICY_TYPES)[number];

export const POLICY_META: Record<PolicyType, { label: string; route: string; icon: string }> = {
  privacy: { label: "Privacy Policy", route: "/privacy-policy", icon: "🔒" },
  terms: { label: "Terms & Conditions", route: "/terms-and-conditions", icon: "📜" },
  refund: { label: "Refund Policy", route: "/refund-policy", icon: "💳" },
  withdrawal: { label: "Withdrawal Policy", route: "/withdrawal-policy", icon: "🏦" },
  community: { label: "Community Policy", route: "/community-policy", icon: "🤝" },
  "fair-play": { label: "Fair Play Policy", route: "/fair-play-policy", icon: "⚖️" },
  grievance: { label: "Contact & Grievance Policy", route: "/grievance-policy", icon: "📞" },
};

export type Policy = {
  id: string;
  policy_type: PolicyType;
  title: string;
  content: string;
  author_id: string | null;
  is_published: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type PolicyVersion = {
  id: string;
  policy_id: string;
  version: number;
  title: string;
  content: string;
  author_id: string | null;
  created_at: string;
};

const LS_KEY = "chessox_policies_v1";

function isMissingTable(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /policies|policy_versions|relation .* does not exist|schema cache|404/i.test(msg);
}

function lsRead(): Record<string, Policy> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as Record<string, Policy>;
  } catch {
    return {};
  }
}
function lsWrite(map: Record<string, Policy>) {
  localStorage.setItem(LS_KEY, JSON.stringify(map));
}

/** Fetch a single policy by type (published or draft; RLS filters for anon). */
export async function getPolicy(type: PolicyType): Promise<Policy | null> {
  try {
    const { data, error } = await supabase
      .from("policies" as never)
      .select("*")
      .eq("policy_type" as never, type as never)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as Policy) ?? null;
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    return lsRead()[type] ?? null;
  }
}

/** Fetch all policies (admin sees drafts; public sees published only via RLS). */
export async function listPolicies(): Promise<Policy[]> {
  try {
    const { data, error } = await supabase.from("policies" as never).select("*");
    if (error) throw error;
    return (data ?? []) as unknown as Policy[];
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    return Object.values(lsRead());
  }
}

/**
 * Save a policy: creates the row on first save, otherwise snapshots the
 * current text into policy_versions and bumps the version number.
 * Content is written exactly as supplied — never altered.
 */
export async function savePolicy(input: {
  type: PolicyType;
  title: string;
  content: string;
  publish: boolean;
}): Promise<Policy> {
  const { data: auth } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  const uid = auth?.user?.id ?? null;
  try {
    const existing = await getPolicy(input.type);
    if (existing) {
      // snapshot the outgoing version for history
      const { error: vErr } = await supabase.from("policy_versions" as never).insert({
        policy_id: existing.id,
        version: existing.version,
        title: existing.title,
        content: existing.content,
        author_id: existing.author_id,
      } as never);
      if (vErr) throw vErr;
      const { data, error } = await supabase
        .from("policies" as never)
        .update({
          title: input.title,
          content: input.content,
          is_published: input.publish,
          version: existing.version + 1,
          author_id: uid,
        } as never)
        .eq("id" as never, existing.id as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Policy;
    }
    const { data, error } = await supabase
      .from("policies" as never)
      .insert({
        policy_type: input.type,
        title: input.title,
        content: input.content,
        is_published: input.publish,
        author_id: uid,
      } as never)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Policy;
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    const map = lsRead();
    const now = new Date().toISOString();
    const prev = map[input.type];
    map[input.type] = {
      id: prev?.id ?? crypto.randomUUID(),
      policy_type: input.type,
      title: input.title,
      content: input.content,
      author_id: uid,
      is_published: input.publish,
      version: (prev?.version ?? 0) + 1,
      created_at: prev?.created_at ?? now,
      updated_at: now,
    };
    lsWrite(map);
    return map[input.type];
  }
}

export async function setPolicyPublished(type: PolicyType, published: boolean): Promise<void> {
  try {
    const { error } = await supabase
      .from("policies" as never)
      .update({ is_published: published } as never)
      .eq("policy_type" as never, type as never);
    if (error) throw error;
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    const map = lsRead();
    if (map[type]) {
      map[type].is_published = published;
      lsWrite(map);
    }
  }
}

export async function deletePolicy(type: PolicyType): Promise<void> {
  try {
    const { error } = await supabase
      .from("policies" as never)
      .delete()
      .eq("policy_type" as never, type as never);
    if (error) throw error;
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    const map = lsRead();
    delete map[type];
    lsWrite(map);
  }
}

/** List saved versions of a policy, newest first (admin only via RLS). */
export async function listPolicyVersions(policyId: string): Promise<PolicyVersion[]> {
  try {
    const { data, error } = await supabase
      .from("policy_versions" as never)
      .select("*")
      .eq("policy_id" as never, policyId as never)
      .order("version", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as PolicyVersion[];
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    return [];
  }
}
