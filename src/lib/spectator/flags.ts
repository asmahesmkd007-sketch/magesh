// =====================================================================
// COUNTRY FLAGS
// ---------------------------------------------------------------------
// `profiles.country` stores a display name chosen from data/geo.ts, not
// an ISO code, so the flag is looked up by name. Covers every entry in
// COUNTRIES; anything unrecognised renders no flag rather than a wrong
// one.
//
// Emoji flags are used deliberately: they need no image requests, which
// matters on a browse page rendering dozens of match cards at once.
// =====================================================================

const FLAG_BY_COUNTRY: Record<string, string> = {
  India: "🇮🇳",
  "United States": "🇺🇸",
  "United Kingdom": "🇬🇧",
  Canada: "🇨🇦",
  Australia: "🇦🇺",
  Germany: "🇩🇪",
  France: "🇫🇷",
  Spain: "🇪🇸",
  Italy: "🇮🇹",
  Netherlands: "🇳🇱",
  Russia: "🇷🇺",
  China: "🇨🇳",
  Japan: "🇯🇵",
  "South Korea": "🇰🇷",
  Brazil: "🇧🇷",
  Mexico: "🇲🇽",
  Argentina: "🇦🇷",
  "South Africa": "🇿🇦",
  Nigeria: "🇳🇬",
  Egypt: "🇪🇬",
  "United Arab Emirates": "🇦🇪",
  "Saudi Arabia": "🇸🇦",
  Pakistan: "🇵🇰",
  Bangladesh: "🇧🇩",
  "Sri Lanka": "🇱🇰",
  Nepal: "🇳🇵",
  Singapore: "🇸🇬",
  Indonesia: "🇮🇩",
  Philippines: "🇵🇭",
  "New Zealand": "🇳🇿",
};

/** Flag emoji for a stored country name, or null when unknown/hidden. */
export function countryFlag(country: string | null | undefined): string | null {
  if (!country) return null;
  return FLAG_BY_COUNTRY[country.trim()] ?? null;
}
