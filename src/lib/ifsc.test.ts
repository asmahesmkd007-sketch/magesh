import { describe, it, expect, vi } from "vitest";
import { isValidIfscFormat, lookupIfsc } from "./ifsc";

describe("IFSC Validation & Lookup", () => {
  describe("isValidIfscFormat", () => {
    it("accepts valid IFSC codes matching official RBI rules", () => {
      expect(isValidIfscFormat("SBIN0011937")).toBe(true);
      expect(isValidIfscFormat("HDFC0000060")).toBe(true);
      expect(isValidIfscFormat("ICIC0000001")).toBe(true);
      expect(isValidIfscFormat("sbin0011937")).toBe(true); // handles lowercase
    });

    it("rejects codes that do not have exactly 11 characters", () => {
      expect(isValidIfscFormat("SBIN001193")).toBe(false); // 10 chars
      expect(isValidIfscFormat("SBIN00119370")).toBe(false); // 12 chars
    });

    it("rejects codes where the 5th character is not '0'", () => {
      expect(isValidIfscFormat("SBIN1011937")).toBe(false);
      expect(isValidIfscFormat("HDFCA000060")).toBe(false);
    });

    it("rejects codes where the first 4 characters contain numbers", () => {
      expect(isValidIfscFormat("SB1N0011937")).toBe(false);
      expect(isValidIfscFormat("12340011937")).toBe(false);
    });

    it("rejects codes with special characters", () => {
      expect(isValidIfscFormat("SBIN001193!")).toBe(false);
    });
  });

  describe("lookupIfsc", () => {
    it("returns error without API call for invalid format", async () => {
      const res = await lookupIfsc("INVALID_CODE");
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe("Invalid IFSC Code");
        expect(res.isOfflineOrError).toBe(false);
      }
    });

    it("fetches and parses bank details for valid IFSC", async () => {
      const mockResponse = {
        BANK: "State Bank of India",
        BRANCH: "MANNACHANALLUR",
        ADDRESS: "DIST TIRUVARUR STATE TAMILNADU",
        CITY: "TIRUVARUR",
        DISTRICT: "TIRUVARUR",
        STATE: "TAMIL NADU",
        IFSC: "SBIN0011937",
      };

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      }));

      const res = await lookupIfsc("SBIN0011937");
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.details.BANK).toBe("State Bank of India");
        expect(res.details.BRANCH).toBe("MANNACHANALLUR");
        expect(res.details.CITY).toBe("TIRUVARUR");
        expect(res.details.DISTRICT).toBe("TIRUVARUR");
        expect(res.details.STATE).toBe("TAMIL NADU");
        expect(res.logData?.requestUrl).toBeDefined();
        expect(res.logData?.httpStatus).toBe(200);
        expect(res.logData?.parsingResult).toBeDefined();
        expect(res.logData?.finalUiState).toBe("Verified");
      }

      vi.unstubAllGlobals();
    });

    it("handles 404 response as Invalid IFSC Code", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }));

      const res = await lookupIfsc("ABCD0000000");
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe("Invalid IFSC Code");
        expect(res.isOfflineOrError).toBe(false);
        expect(res.logData?.finalUiState).toBe("Invalid IFSC Code");
      }

      vi.unstubAllGlobals();
    });

    it("handles network failure gracefully as service unavailable", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

      const res = await lookupIfsc("WXYZ0012345");
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe("Verification service temporarily unavailable.");
        expect(res.isOfflineOrError).toBe(true);
        expect(res.logData?.finalUiState).toBe("Verification service temporarily unavailable.");
      }

      vi.unstubAllGlobals();
    });
  });
});
