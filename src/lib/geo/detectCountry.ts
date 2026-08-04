// =====================================================================
// First-visit country detection — offline, no IP lookup
// ---------------------------------------------------------------------
// The onboarding form pre-selects a country so most players never have
// to touch the selector. It is a CONVENIENCE ONLY: the guess is always
// overridable, and it is never applied over a country the player (or
// their saved profile) already chose.
//
// Deliberately no geo-IP request. A third-party lookup on a signup form
// would send the player's address to someone else's server, add a
// network dependency to a form that must work offline-ish, and be
// blocked by every tracker blocker anyway. Both signals used here are
// already in the browser:
//
//   1. The IANA time zone — reflects where the device actually is, and
//      is by far the stronger signal.
//   2. The locale region subtag — "en-IN" -> IN. Weaker, because
//      browsers commonly report en-US/en-GB regardless of location, so
//      it is only consulted when the time zone says nothing.
// =====================================================================
import { countryByCode, countryByName, type Country } from "@/data/countries";

// Time zones whose country is not simply "the first city I recognise".
// Only zones with a real user base are listed; anything missing falls
// through to the locale check and then to no guess at all.
const ZONE_TO_COUNTRY: Readonly<Record<string, string>> = {
  // South Asia
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Karachi": "PK",
  "Asia/Dhaka": "BD",
  "Asia/Colombo": "LK",
  "Asia/Kathmandu": "NP",
  "Asia/Thimphu": "BT",
  "Asia/Kabul": "AF",
  "Indian/Maldives": "MV",
  // East / South-East Asia
  "Asia/Shanghai": "CN",
  "Asia/Urumqi": "CN",
  "Asia/Chongqing": "CN",
  "Asia/Hong_Kong": "HK",
  "Asia/Macau": "MO",
  "Asia/Taipei": "TW",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Pyongyang": "KP",
  "Asia/Singapore": "SG",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Kuching": "MY",
  "Asia/Jakarta": "ID",
  "Asia/Makassar": "ID",
  "Asia/Jayapura": "ID",
  "Asia/Pontianak": "ID",
  "Asia/Manila": "PH",
  "Asia/Bangkok": "TH",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Saigon": "VN",
  "Asia/Phnom_Penh": "KH",
  "Asia/Vientiane": "LA",
  "Asia/Yangon": "MM",
  "Asia/Brunei": "BN",
  "Asia/Dili": "TL",
  "Asia/Ulaanbaatar": "MN",
  // Central Asia / Caucasus
  "Asia/Almaty": "KZ",
  "Asia/Aqtobe": "KZ",
  "Asia/Tashkent": "UZ",
  "Asia/Bishkek": "KG",
  "Asia/Dushanbe": "TJ",
  "Asia/Ashgabat": "TM",
  "Asia/Baku": "AZ",
  "Asia/Yerevan": "AM",
  "Asia/Tbilisi": "GE",
  // Middle East
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Asia/Qatar": "QA",
  "Asia/Bahrain": "BH",
  "Asia/Kuwait": "KW",
  "Asia/Muscat": "OM",
  "Asia/Tehran": "IR",
  "Asia/Baghdad": "IQ",
  "Asia/Amman": "JO",
  "Asia/Beirut": "LB",
  "Asia/Damascus": "SY",
  "Asia/Jerusalem": "IL",
  "Asia/Tel_Aviv": "IL",
  "Asia/Gaza": "PS",
  "Asia/Hebron": "PS",
  "Asia/Nicosia": "CY",
  "Europe/Istanbul": "TR",
  "Asia/Istanbul": "TR",
  // Europe
  "Europe/London": "GB",
  "Europe/Belfast": "GB",
  "Europe/Dublin": "IE",
  "Europe/Lisbon": "PT",
  "Atlantic/Azores": "PT",
  "Atlantic/Madeira": "PT",
  "Europe/Madrid": "ES",
  "Atlantic/Canary": "ES",
  "Europe/Paris": "FR",
  "Europe/Brussels": "BE",
  "Europe/Amsterdam": "NL",
  "Europe/Luxembourg": "LU",
  "Europe/Berlin": "DE",
  "Europe/Zurich": "CH",
  "Europe/Vienna": "AT",
  "Europe/Rome": "IT",
  "Europe/Vatican": "VA",
  "Europe/Malta": "MT",
  "Europe/Monaco": "MC",
  "Europe/Andorra": "AD",
  "Europe/Gibraltar": "GI",
  "Europe/Copenhagen": "DK",
  "Europe/Oslo": "NO",
  "Europe/Stockholm": "SE",
  "Europe/Helsinki": "FI",
  "Europe/Reykjavik": "IS",
  "Europe/Tallinn": "EE",
  "Europe/Riga": "LV",
  "Europe/Vilnius": "LT",
  "Europe/Warsaw": "PL",
  "Europe/Prague": "CZ",
  "Europe/Bratislava": "SK",
  "Europe/Budapest": "HU",
  "Europe/Ljubljana": "SI",
  "Europe/Zagreb": "HR",
  "Europe/Sarajevo": "BA",
  "Europe/Belgrade": "RS",
  "Europe/Podgorica": "ME",
  "Europe/Skopje": "MK",
  "Europe/Tirane": "AL",
  "Europe/Athens": "GR",
  "Europe/Sofia": "BG",
  "Europe/Bucharest": "RO",
  "Europe/Chisinau": "MD",
  "Europe/Kyiv": "UA",
  "Europe/Kiev": "UA",
  "Europe/Minsk": "BY",
  "Europe/Moscow": "RU",
  "Europe/Kaliningrad": "RU",
  "Europe/Samara": "RU",
  "Asia/Yekaterinburg": "RU",
  "Asia/Novosibirsk": "RU",
  "Asia/Krasnoyarsk": "RU",
  "Asia/Irkutsk": "RU",
  "Asia/Vladivostok": "RU",
  // Africa
  "Africa/Cairo": "EG",
  "Africa/Casablanca": "MA",
  "Africa/Algiers": "DZ",
  "Africa/Tunis": "TN",
  "Africa/Tripoli": "LY",
  "Africa/Khartoum": "SD",
  "Africa/Lagos": "NG",
  "Africa/Accra": "GH",
  "Africa/Abidjan": "CI",
  "Africa/Dakar": "SN",
  "Africa/Bamako": "ML",
  "Africa/Nairobi": "KE",
  "Africa/Kampala": "UG",
  "Africa/Dar_es_Salaam": "TZ",
  "Africa/Kigali": "RW",
  "Africa/Addis_Ababa": "ET",
  "Africa/Johannesburg": "ZA",
  "Africa/Harare": "ZW",
  "Africa/Lusaka": "ZM",
  "Africa/Maputo": "MZ",
  "Africa/Windhoek": "NA",
  "Africa/Gaborone": "BW",
  "Africa/Kinshasa": "CD",
  "Africa/Luanda": "AO",
  "Africa/Douala": "CM",
  "Indian/Mauritius": "MU",
  // North America
  "America/New_York": "US",
  "America/Detroit": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Phoenix": "US",
  "America/Los_Angeles": "US",
  "America/Anchorage": "US",
  "Pacific/Honolulu": "US",
  "America/Toronto": "CA",
  "America/Montreal": "CA",
  "America/Winnipeg": "CA",
  "America/Edmonton": "CA",
  "America/Vancouver": "CA",
  "America/Halifax": "CA",
  "America/St_Johns": "CA",
  "America/Mexico_City": "MX",
  "America/Monterrey": "MX",
  "America/Tijuana": "MX",
  "America/Cancun": "MX",
  // Central America / Caribbean
  "America/Guatemala": "GT",
  "America/El_Salvador": "SV",
  "America/Tegucigalpa": "HN",
  "America/Managua": "NI",
  "America/Costa_Rica": "CR",
  "America/Panama": "PA",
  "America/Havana": "CU",
  "America/Jamaica": "JM",
  "America/Port-au-Prince": "HT",
  "America/Santo_Domingo": "DO",
  "America/Puerto_Rico": "PR",
  "America/Nassau": "BS",
  "America/Barbados": "BB",
  "America/Port_of_Spain": "TT",
  // South America
  "America/Bogota": "CO",
  "America/Caracas": "VE",
  "America/Lima": "PE",
  "America/La_Paz": "BO",
  "America/Santiago": "CL",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Argentina/Cordoba": "AR",
  "America/Argentina/Mendoza": "AR",
  "America/Montevideo": "UY",
  "America/Asuncion": "PY",
  "America/Sao_Paulo": "BR",
  "America/Bahia": "BR",
  "America/Fortaleza": "BR",
  "America/Recife": "BR",
  "America/Manaus": "BR",
  "America/Guayaquil": "EC",
  "America/Guyana": "GY",
  "America/Paramaribo": "SR",
  // Oceania
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Australia/Adelaide": "AU",
  "Australia/Hobart": "AU",
  "Australia/Darwin": "AU",
  "Pacific/Auckland": "NZ",
  "Pacific/Chatham": "NZ",
  "Pacific/Fiji": "FJ",
  "Pacific/Port_Moresby": "PG",
  "Pacific/Guam": "GU",
  "Pacific/Apia": "WS",
  "Pacific/Tongatapu": "TO",
};

/** The device time zone, or "" where Intl is unavailable. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

/** Country implied by an IANA zone name, or null. Exported for tests. */
export function countryCodeFromTimezone(zone: string | null | undefined): string | null {
  if (!zone) return null;
  return ZONE_TO_COUNTRY[zone] ?? null;
}

/**
 * Region subtag of a BCP-47 locale ("en-IN" -> "IN", "pt-BR" -> "BR").
 * Returns null for language-only tags. Exported for tests.
 */
export function countryCodeFromLocale(locale: string | null | undefined): string | null {
  if (!locale) return null;
  // Match the 2-letter region subtag; skip script subtags ("zh-Hant-TW").
  const match = /(?:^|-)([A-Za-z]{2})$/.exec(locale.trim());
  if (!match) return null;
  const code = match[1].toUpperCase();
  // A bare "en" would match the language itself — a real region subtag
  // is never the whole tag.
  if (locale.trim().length === 2) return null;
  return countryByCode(code) ? code : null;
}

/**
 * Best guess at the player's country as an ISO alpha-2 code, or null
 * when nothing reliable is available. Safe to call during SSR — it
 * returns null rather than touching `navigator`.
 */
export function detectCountryCode(): string | null {
  if (typeof window === "undefined") return null;

  const fromZone = countryCodeFromTimezone(detectTimezone());
  if (fromZone) return fromZone;

  const locales: string[] =
    typeof navigator !== "undefined"
      ? [...(navigator.languages ?? []), navigator.language].filter(Boolean)
      : [];
  for (const locale of locales) {
    const code = countryCodeFromLocale(locale);
    if (code) return code;
  }

  return null;
}

// ── Which country should the form open on? ───────────────────────────

/**
 * `profiles.country` is declared `DEFAULT 'India'` (schema.sql SECTION
 * 3), so EVERY freshly created row already carries this value. Treating
 * it as a deliberate choice would mean detection never ran for anyone —
 * a name equal to the default is therefore treated as "not chosen yet",
 * and only `country_code` (written solely by this form) proves intent.
 */
const SCHEMA_DEFAULT_COUNTRY = "India";

export type InitialCountry = { country: Country; detected: boolean };

/**
 * Picks the country the onboarding form should open on:
 *
 *   1. a saved country_code — an explicit past choice, always wins;
 *   2. a saved name other than the schema default — a pre-country_code
 *      profile that was genuinely filled in;
 *   3. the detected country, flagged so the UI can say it guessed;
 *   4. the saved default name, so India users still open on India when
 *      detection is unavailable.
 */
export function resolveInitialCountry(input: {
  savedCode?: string | null;
  savedName?: string | null;
  detect?: () => string | null;
}): InitialCountry | null {
  const byCode = countryByCode(input.savedCode);
  if (byCode) return { country: byCode, detected: false };

  const byName = countryByName(input.savedName);
  if (byName && byName.name !== SCHEMA_DEFAULT_COUNTRY) {
    return { country: byName, detected: false };
  }

  const detect = input.detect ?? detectCountryCode;
  const detected = countryByCode(detect());
  if (detected) return { country: detected, detected: true };

  return byName ? { country: byName, detected: false } : null;
}
