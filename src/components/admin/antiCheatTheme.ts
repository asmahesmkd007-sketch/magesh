// =====================================================================
// ANTI-CHEAT DASHBOARD — visual tokens
// ---------------------------------------------------------------------
// Non-component exports kept out of AntiCheatPanels.tsx so that file
// only exports components (React Fast Refresh requirement).
//
// The two series colors are validated for the dark admin surface
// (#141414): OKLCH lightness inside the dark band, chroma above the
// floor, and ΔE ≈ 28 apart under normal vision as well as protanopia,
// deuteranopia and tritanopia — so White vs Black stays distinguishable
// for colorblind reviewers. Both series are also directly labeled.
// =====================================================================

import type { AntiCheatSeverity, RiskLevel } from "@/lib/anticheat/types";

export const SERIES = { primary: "#a8862a", secondary: "#4f8ef7" } as const;

export const RISK_LABEL: Record<RiskLevel, string> = {
  safe: "Safe",
  monitor: "Monitor",
  warning: "Warning",
  review: "Review",
  high_risk: "High Risk",
};

export const RISK_CLASS: Record<RiskLevel, string> = {
  safe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  monitor: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  review: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  high_risk: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};

export const SEVERITY_CLASS: Record<AntiCheatSeverity, string> = {
  info: "border-white/15 bg-white/5 text-muted-foreground",
  low: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  high: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  critical: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};

/** Per-category ceilings, mirrored from ANTICHEAT_CONFIG.risk.caps for display. */
export const CATEGORY_ROWS = [
  { key: "engine", label: "Engine similarity", cap: 45 },
  { key: "timing", label: "Move timing", cap: 25 },
  { key: "behavior", label: "Browser behavior", cap: 15 },
  { key: "connection", label: "Connection", cap: 15 },
  { key: "account", label: "Account signals", cap: 20 },
] as const;
