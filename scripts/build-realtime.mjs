// =====================================================================
// Bundles the Socket.IO realtime server into the Nitro output.
// ---------------------------------------------------------------------
// Runs after `vite build`, writing `.output/server/realtime.mjs`, which
// `server/index.mjs` imports alongside Nitro's own `index.mjs`. Keeping
// it inside `.output` means the deploy artifact is still one directory.
//
// Everything is bundled (no external packages) so the output does not
// depend on node_modules being present at runtime, matching how Nitro
// builds its own server chunk.
// =====================================================================
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const result = await build({
  entryPoints: [resolve(root, "src/realtime/server/entry.ts")],
  outfile: resolve(root, ".output/server/realtime.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  minify: true,
  // `@/…` is the project's TS path alias; esbuild needs it spelled out.
  alias: { "@": resolve(root, "src") },
  // import.meta.env is a Vite construct; on the server the realtime
  // bundle reads plain process.env, so stub the object it probes.
  define: { "import.meta.env": "{}" },
  // Node built-ins that some transitive deps reference optionally.
  external: ["bufferutil", "utf-8-validate"],
  // socket.io/engine.io are CommonJS and call `require("http")` at load
  // time. Bundling CJS into an ESM output leaves those calls pointing at
  // esbuild's shim, which throws "Dynamic require of \"http\" is not
  // supported". Handing the bundle a real `require` built from
  // import.meta.url is the standard fix.
  banner: {
    js: [
      `import { createRequire as __nodeCreateRequire } from "node:module";`,
      `import { fileURLToPath as __nodeFileURLToPath } from "node:url";`,
      `import { dirname as __nodeDirname } from "node:path";`,
      `const require = __nodeCreateRequire(import.meta.url);`,
      `const __filename = __nodeFileURLToPath(import.meta.url);`,
      `const __dirname = __nodeDirname(__filename);`,
    ].join("\n"),
  },
  logLevel: "info",
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs).reduce((sum, o) => sum + o.bytes, 0);

console.log(`[realtime] bundled ${(bytes / 1024).toFixed(0)} kB -> .output/server/realtime.mjs`);
