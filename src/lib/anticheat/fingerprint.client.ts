// =====================================================================
// ANTI-CHEAT — device/browser fingerprint (client)
// ---------------------------------------------------------------------
// A privacy-light fingerprint from stable, non-invasive browser
// signals (no canvas/audio probing). It is deliberately coarse: its
// job is to correlate ACCOUNTS sharing a device for admin review, not
// to track individuals. Hashing happens client-side (SHA-256); the
// server pairs it with a salted IP hash and stores both.
// =====================================================================

export interface FingerprintComponents {
  userAgent: string;
  platform: string;
  languages: string;
  timezone: string;
  screen: string;
  colorDepth: number;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  touchPoints: number;
  webdriver: boolean;
}

export interface DeviceFingerprint {
  hash: string;
  components: FingerprintComponents;
}

export function collectComponents(): FingerprintComponents {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: nav.userAgent ?? "",
    platform: nav.platform ?? "",
    languages: (nav.languages ?? []).join(","),
    timezone: (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
      } catch {
        return "";
      }
    })(),
    screen: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}@${window.devicePixelRatio ?? 1}`,
    colorDepth: window.screen?.colorDepth ?? 0,
    hardwareConcurrency: nav.hardwareConcurrency ?? 0,
    deviceMemory: nav.deviceMemory ?? null,
    touchPoints: nav.maxTouchPoints ?? 0,
    webdriver: nav.webdriver === true,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let cached: Promise<DeviceFingerprint> | null = null;

/** Compute (and memoize for the session) the device fingerprint. */
export function getDeviceFingerprint(): Promise<DeviceFingerprint> {
  if (!cached) {
    cached = (async () => {
      const components = collectComponents();
      // webdriver is excluded from the hash — it fluctuates with tooling
      // and is reported separately as an automation signal.
      const stable = { ...components, webdriver: undefined };
      const hash = await sha256Hex(JSON.stringify(stable));
      return { hash, components };
    })();
  }
  return cached;
}
