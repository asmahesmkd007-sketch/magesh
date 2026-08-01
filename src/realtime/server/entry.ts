// =====================================================================
// REALTIME BUNDLE ENTRY
// ---------------------------------------------------------------------
// The single module `server/index.mjs` imports. Bundled to
// `.output/server/realtime.mjs` by scripts/build-realtime.mjs so the
// deployable artifact stays self-contained.
// =====================================================================
import type { Server as HttpServer } from "node:http";

import { attachRealtime as attach, getIo } from "./io";
import { registryStats, shutdownRegistry } from "./registry";

export function attachRealtime(httpServer: HttpServer) {
  return attach(httpServer);
}

/** Flush live games and close sockets. Called from the SIGTERM handler. */
export async function shutdownRealtime(): Promise<void> {
  const io = getIo();
  // Tell connected clients to stop retrying against a dying instance;
  // socket.io-client reconnects to whichever instance answers next.
  if (io) await new Promise<void>((resolve) => io.close(() => resolve()));
  await shutdownRegistry();
}

export { registryStats };
