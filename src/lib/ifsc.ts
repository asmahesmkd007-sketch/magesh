export type IfscDetails = {
  BANK: string;
  BRANCH: string;
  ADDRESS: string;
  CITY: string;
  STATE: string;
  DISTRICT?: string;
  MICR?: string;
  IFSC: string;
};

/**
 * Official Indian Financial System Code (IFSC) Regex:
 * 1. Exactly 11 characters
 * 2. First 4 characters: Uppercase bank letters (A-Z)
 * 3. Fifth character: '0'
 * 4. Last 6 characters: Alphanumeric branch code (A-Z, 0-9)
 */
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Validates IFSC format according to standard rules:
 * - 11 characters long
 * - First 4 characters uppercase letters
 * - 5th character is '0'
 * - Last 6 characters alphanumeric
 */
export function isValidIfscFormat(code: string): boolean {
  return IFSC_REGEX.test(code.trim().toUpperCase());
}

// In-memory cache for successful lookups to avoid unnecessary API calls
const ifscCache = new Map<string, IfscDetails>();

export type IfscVerifyResult =
  | { success: true; details: IfscDetails }
  | { success: false; error: string; isOfflineOrError?: boolean };

/**
 * Looks up IFSC code against Razorpay IFSC API service after format validation.
 * Caches successful responses.
 */
export async function lookupIfsc(rawCode: string): Promise<IfscVerifyResult> {
  const code = rawCode.trim().toUpperCase();

  if (!code) {
    return { success: false, error: "" };
  }

  if (code.length < 11) {
    return { success: false, error: "" };
  }

  if (!isValidIfscFormat(code)) {
    return {
      success: false,
      error: "Invalid IFSC Code. Format must be 4 letters, '0', and 6 alphanumeric characters.",
    };
  }

  // Serve from cache if already verified
  if (ifscCache.has(code)) {
    return { success: true, details: ifscCache.get(code)! };
  }

  try {
    const res = await fetch(`https://ifsc.razorpay.com/${code}`);

    if (res.status === 404) {
      return {
        success: false,
        error: "Invalid IFSC Code. Please check and try again.",
      };
    }

    if (!res.ok) {
      return {
        success: false,
        error: "Unable to verify IFSC at the moment.",
        isOfflineOrError: true,
      };
    }

    const data = await res.json();

    const details: IfscDetails = {
      BANK: data.BANK || "Bank",
      BRANCH: data.BRANCH || "Branch",
      ADDRESS: data.ADDRESS || "",
      CITY: data.CITY || data.CENTRE || data.DISTRICT || "",
      STATE: data.STATE || "",
      DISTRICT: data.DISTRICT || "",
      MICR: data.MICR || "",
      IFSC: data.IFSC || code,
    };

    // Cache successful lookup
    ifscCache.set(code, details);

    return { success: true, details };
  } catch (err) {
    // Network error or offline
    return {
      success: false,
      error: "Unable to verify IFSC at the moment.",
      isOfflineOrError: true,
    };
  }
}
