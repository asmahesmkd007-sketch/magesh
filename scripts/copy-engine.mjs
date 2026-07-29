// =====================================================================
// Copies the Stockfish WASM builds from node_modules into public/engine
// so the browser can spawn them as classic workers served same-origin.
// Runs automatically before `dev` and `build` (see package.json). The
// destination is gitignored — node_modules stays the single source of
// truth for engine binaries and the copy is always version-consistent.
// =====================================================================
import { copyFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "stockfish", "bin");
const dest = join(root, "public", "engine");

// lite-single runs everywhere (no cross-origin isolation required);
// lite (multi-threaded) is used automatically when COOP/COEP headers
// make the page crossOriginIsolated.
const FILES = [
  "stockfish-18-lite-single.js",
  "stockfish-18-lite-single.wasm",
  "stockfish-18-lite.js",
  "stockfish-18-lite.wasm",
];

if (!existsSync(src)) {
  console.error("[copy-engine] stockfish package not found — run `npm install` first.");
  process.exit(1);
}

mkdirSync(dest, { recursive: true });

let copied = 0;
for (const f of FILES) {
  const from = join(src, f);
  const to = join(dest, f);
  if (!existsSync(from)) {
    console.error(`[copy-engine] missing ${f} in stockfish package — engine version mismatch?`);
    process.exit(1);
  }
  // Skip unchanged files so repeated dev runs stay instant.
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
  copied++;
}

console.log(
  `[copy-engine] engine assets ready (${copied} copied, ${FILES.length - copied} up to date).`,
);
