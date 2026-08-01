// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Pre-compress every public asset at build time. The node-server preset
  // serves the .br/.gz sibling automatically when the client advertises the
  // encoding, and falls back to the raw file otherwise.
  //
  // Measured before this was set: requesting the main bundle with
  // `Accept-Encoding: gzip` returned all 830,837 bytes uncompressed — the same
  // file is ~209 KB brotli. The two Stockfish .wasm binaries (~7 MB each) were
  // likewise shipped raw. This is build-time only: no new service, no runtime
  // middleware, no change to how the app is deployed.
  //
  // `compressPublicAssets` is a real Nitro option and is forwarded verbatim,
  // but the wrapper's `nitro` prop is typed with only the handful of fields it
  // documents, so the cast is what lets a valid option through.
  // `node-middleware` exports a Node request handler and does NOT listen,
  // which is what lets server/index.mjs own the http.Server and hand the
  // WebSocket upgrade to Socket.IO. `node-server` calls srvx's serve()
  // itself and keeps the server private, so nothing could attach to it.
  nitro: {
    preset: "node-middleware",
    compressPublicAssets: { gzip: true, brotli: true },
  } as { preset: string },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      {
        name: "realtime-dev-server",
        configureServer(server) {
          if (server.httpServer) {
            server
              .ssrLoadModule("./src/realtime/server/io.ts")
              .then((mod) => {
                mod.attachRealtime(server.httpServer);
              })
              .catch((err) => {
                console.error("[realtime-dev-server] failed to load io.ts:", err);
              });
          }
        },
      },
    ],
    preview: {
      allowedHosts: true,
    },
  },
});
