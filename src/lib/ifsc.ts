import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
  | { success: true; details: IfscDetails; logData?: Record<string, any> }
  | { success: false; error: string; isOfflineOrError?: boolean; logData?: Record<string, any> };

/**
 * Directly fetches IFSC details from the external IFSC API service.
 * Used on the server-side to bypass browser CORS restrictions.
 */
export async function fetchIfscDirectly(code: string): Promise<IfscVerifyResult> {
  const requestUrl = `https://ifsc.razorpay.com/${code}`;

  try {
    const res = await fetch(requestUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });

    const status = res.status;

    if (status === 404) {
      const bodyText = "Not Found";
      const logData = {
        requestUrl,
        httpStatus: status,
        responseBody: bodyText,
        parsingResult: "Not Found (404)",
        finalUiState: "Invalid IFSC Code",
      };
      console.log(`[IFSC Server Log] URL: ${requestUrl} | Status: ${status} | Result: Invalid IFSC Code`);
      return {
        success: false as const,
        error: "Invalid IFSC Code",
        isOfflineOrError: false,
        logData,
      };
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "HTTP Error");
      const logData = {
        requestUrl,
        httpStatus: status,
        responseBody: bodyText,
        parsingResult: `HTTP Error ${status}`,
        finalUiState: "Verification service temporarily unavailable.",
      };
      console.log(`[IFSC Server Log] URL: ${requestUrl} | Status: ${status} | Result: Service Unavailable`);
      return {
        success: false as const,
        error: "Verification service temporarily unavailable.",
        isOfflineOrError: true,
        logData,
      };
    }

    const json = await res.json();
    const details: IfscDetails = {
      BANK: json.BANK || "Bank",
      BRANCH: json.BRANCH || "Branch",
      ADDRESS: json.ADDRESS || "",
      CITY: json.CITY || json.CENTRE || json.DISTRICT || "",
      DISTRICT: json.DISTRICT || json.CITY || json.CENTRE || "",
      STATE: json.STATE || "",
      MICR: json.MICR || "",
      IFSC: json.IFSC || code,
    };

    const bodySnippet = JSON.stringify(json);
    const logData = {
      requestUrl,
      httpStatus: status,
      responseBody: bodySnippet,
      parsingResult: `Parsed OK: ${details.BANK} (${details.BRANCH})`,
      finalUiState: "Verified",
    };

    console.log(`[IFSC Server Log] URL: ${requestUrl} | Status: ${status} | Result: Success (${details.BANK}, ${details.BRANCH})`);

    return {
      success: true as const,
      details,
      logData,
    };
  } catch (err: any) {
    const errMsg = String(err?.message || err);
    const logData = {
      requestUrl,
      httpStatus: 0,
      responseBody: errMsg,
      parsingResult: "Network/Fetch Exception",
      finalUiState: "Verification service temporarily unavailable.",
    };
    console.error(`[IFSC Server Error] URL: ${requestUrl} | Error: ${errMsg}`);
    return {
      success: false as const,
      error: "Verification service temporarily unavailable.",
      isOfflineOrError: true,
      logData,
    };
  }
}

/**
 * Server function to fetch IFSC details from external service server-side,
 * avoiding browser CORS restrictions.
 */
export const verifyIfscServerFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ code: z.string().min(11).max(11) }))
  .handler(async ({ data }) => {
    return fetchIfscDirectly(data.code.toUpperCase());
  });

/**
 * Looks up IFSC code via server function with fallback for direct execution.
 * Validates format and serves from in-memory cache if available.
 * Logs: request URL, HTTP status, response body, parsing result, and final UI state.
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
    const result = {
      success: false as const,
      error: "Invalid IFSC Code",
      isOfflineOrError: false,
      logData: {
        requestUrl: "N/A (Format validation failed)",
        httpStatus: 0,
        responseBody: "N/A",
        parsingResult: "Format Invalid",
        finalUiState: "Invalid IFSC Code",
      },
    };
    console.log(`[IFSC Lookup] Code: ${code} | Format Invalid | UI State: Invalid IFSC Code`);
    return result;
  }

  // Serve from cache if already verified
  if (ifscCache.has(code)) {
    const details = ifscCache.get(code)!;
    const result = {
      success: true as const,
      details,
      logData: {
        requestUrl: `https://ifsc.razorpay.com/${code} (Cache Hit)`,
        httpStatus: 200,
        responseBody: "(Cached)",
        parsingResult: `Cache Hit: ${details.BANK} (${details.BRANCH})`,
        finalUiState: "Verified",
      },
    };
    console.log(`[IFSC Lookup] Code: ${code} | Cache Hit -> ${details.BANK}, ${details.BRANCH}`);
    return result;
  }

  try {
    let res: IfscVerifyResult;
    try {
      res = await verifyIfscServerFn({ data: { code } });
    } catch {
      // Direct fallback when running in Node / Vitest test environment without TanStack Start request context
      res = await fetchIfscDirectly(code);
    }

    if (res.success) {
      ifscCache.set(code, res.details);
    }

    if (res.logData) {
      console.log(`[IFSC Verification Log]`, {
        requestUrl: res.logData.requestUrl,
        httpStatus: res.logData.httpStatus,
        responseBody: res.logData.responseBody,
        parsingResult: res.logData.parsingResult,
        finalUiState: res.logData.finalUiState,
      });
    }

    return res;
  } catch (err: any) {
    const errMsg = String(err?.message || err);
    const result = {
      success: false as const,
      error: "Verification service temporarily unavailable.",
      isOfflineOrError: true,
      logData: {
        requestUrl: `https://ifsc.razorpay.com/${code}`,
        httpStatus: 0,
        responseBody: errMsg,
        parsingResult: "Exception during IFSC lookup",
        finalUiState: "Verification service temporarily unavailable.",
      },
    };
    console.log(`[IFSC Verification Log]`, result.logData);
    return result;
  }
}
