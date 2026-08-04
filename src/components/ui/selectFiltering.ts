// =====================================================================
// Option filtering for SearchableSelect
// ---------------------------------------------------------------------
// Kept out of the component file so it stays a pure, directly testable
// function (and so the component file exports only its component, which
// is what Fast Refresh needs).
// =====================================================================

export type SelectOption = {
  value: string;
  label: string;
  /** Rendered before the label — a flag emoji, for instance. */
  prefix?: string;
  /** Extra text that should also match the query (e.g. an ISO code). */
  keywords?: string;
};

/** Fold case and accents so "cordoba" matches "Córdoba". */
function normalise(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Filters and ranks options for a query. Prefix matches come first, so
 * typing "ind" offers India before British Indian Ocean Territory;
 * `keywords` (the ISO code) matches too, so "IN" finds India as well.
 * An empty query returns the list untouched.
 */
export function filterOptions(
  options: readonly SelectOption[],
  query: string,
): readonly SelectOption[] {
  const q = normalise(query.trim());
  if (!q) return options;

  const starts: SelectOption[] = [];
  const contains: SelectOption[] = [];
  for (const option of options) {
    const label = normalise(option.label);
    const keywords = option.keywords ? normalise(option.keywords) : "";
    if (label.startsWith(q) || keywords.split(/\s+/).some((k) => k && k.startsWith(q))) {
      starts.push(option);
    } else if (label.includes(q) || keywords.includes(q)) {
      contains.push(option);
    }
  }
  return [...starts, ...contains];
}
