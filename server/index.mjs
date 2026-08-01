// =====================================================================
// PRODUCTION ENTRY — app + realtime in one process, on one port
// ---------------------------------------------------------------------
// Nitro's `node-server` preset calls srvx's `serve()` itself and keeps
// the resulting http.Server private, so there is nothing for Socket.IO
// to attach to. Nitro's `node-middleware` preset instead *exports* a
// plain Node request handler and never listens, which lets this file own
// the server:
//
//     http.Server
//       ├── /realtime           -> Socket.IO (WS upgrade + polling)
//       ├── /assets/**, /engine/** -> static files from .output/public
//       └── everything else     -> Nitro (SSR + server functions)
//
// One process, one port, one origin: no sidecar, no reverse proxy, no
// CORS. Deployment stays `node server/index.mjs` behind whatever already
// fronts the app.
//
// Serving static files here is not optional: `node-middleware` hands the
// host responsibility for `.output/public`, which srvx used to do under
// `node-server`. This handler also keeps the two properties that were
// measured in place before the migration — pre-compressed .br/.gz
// variants, and immutable caching for hashed assets.
// =====================================================================
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = resolve(fileURLToPath(import.meta.url), "..");
const OUTPUT = resolve(here, "..", ".output");
const PUBLIC_DIR = join(OUTPUT, "public");

const PORT = Number.parseInt(process.env.PORT ?? process.env.NITRO_PORT ?? "3000", 10);
const HOST = process.env.HOST ?? process.env.NITRO_HOST ?? undefined;

const { middleware } = await import(pathToFileURL(join(OUTPUT, "server", "index.mjs")).href);
const { attachRealtime, shutdownRealtime } = await import(
  pathToFileURL(join(OUTPUT, "server", "realtime.mjs")).href
);

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

/** Resolve a URL path to a real file under .output/public, or null. */
function resolveStatic(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (decoded.endsWith("/")) return null;
  // normalize() collapses ".." before the prefix check, so a traversal
  // attempt can never escape PUBLIC_DIR.
  const candidate = normalize(join(PUBLIC_DIR, decoded));
  if (candidate !== PUBLIC_DIR && !candidate.startsWith(PUBLIC_DIR + sep)) return null;
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
  return candidate;
}

/** Pick the best pre-compressed sibling the client will accept. */
function negotiate(filePath, acceptEncoding) {
  const accepts = String(acceptEncoding ?? "");
  if (accepts.includes("br") && existsSync(`${filePath}.br`)) {
    return { path: `${filePath}.br`, encoding: "br" };
  }
  if (accepts.includes("gzip") && existsSync(`${filePath}.gz`)) {
    return { path: `${filePath}.gz`, encoding: "gzip" };
  }
  return { path: filePath, encoding: null };
}

function serveStatic(req, res, filePath) {
  const { path: sendPath, encoding } = negotiate(filePath, req.headers["accept-encoding"]);
  const stat = statSync(sendPath);
  const ext = extname(filePath).toLowerCase();

  // Vite hashes /assets/* filenames, so their content can never change
  // under the same URL. Everything else in public/ (icons, the engine
  // wasm, manifest) keeps a shorter, revalidating cache.
  const immutable = filePath.includes(`${sep}assets${sep}`);
  res.setHeader(
    "cache-control",
    immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600, must-revalidate",
  );
  res.setHeader("content-type", MIME[ext] ?? "application/octet-stream");
  res.setHeader("content-length", stat.size);
  if (encoding) {
    res.setHeader("content-encoding", encoding);
    // The cached entity varies by encoding — without this a shared cache
    // could hand a brotli body to a client that never asked for one.
    res.setHeader("vary", "accept-encoding");
  }
  res.setHeader("x-content-type-options", "nosniff");

  if (req.method === "HEAD") {
    res.statusCode = 200;
    res.end();
    return;
  }
  res.statusCode = 200;
  createReadStream(sendPath).pipe(res);
}

const httpServer = createServer((req, res) => {
  if (req.method === "GET" || req.method === "HEAD") {
    const filePath = resolveStatic(req.url ?? "/");
    if (filePath) {
      try {
        serveStatic(req, res, filePath);
        return;
      } catch {
        // fall through to Nitro rather than failing the request
      }
    }
  }
  middleware(req, res);
});

// Long-lived game sockets must not be cut off by the default 5s
// keep-alive idle timeout; headersTimeout has to stay above it.
httpServer.keepAliveTimeout = 65_000;
httpServer.headersTimeout = 70_000;

attachRealtime(httpServer);

httpServer.listen(PORT, HOST, () => {
  console.log(`[chessox] listening on http://${HOST ?? "0.0.0.0"}:${PORT} (realtime on /realtime)`);
});

// ── Graceful shutdown ────────────────────────────────────────────────
// On a rolling deploy: stop accepting connections, flush every live game
// (finished ones persisted, in-progress ones checkpointed), then exit.
// Players reconnecting to the new instance resume their board.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[chessox] ${signal} received — draining`);

  const forced = setTimeout(() => process.exit(1), 15_000);
  forced.unref?.();

  httpServer.close();
  try {
    await shutdownRealtime();
  } catch (error) {
    console.error("[chessox] realtime shutdown failed", error);
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
