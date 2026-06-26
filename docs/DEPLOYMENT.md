# ChessOx — Deployment

## Prerequisites

- Node 20+, npm (single lockfile: `package-lock.json`).
- A Supabase project with the migrations in `supabase/migrations/` applied.
- Environment variables (see `.env.example`).

## Environment variables

| Var                             | Scope          | Required               | Notes                             |
| ------------------------------- | -------------- | ---------------------- | --------------------------------- |
| `VITE_SUPABASE_URL`             | public (build) | yes                    | Project URL                       |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | public (build) | yes                    | Anon key                          |
| `SUPABASE_URL`                  | server         | yes                    | Same URL, read at runtime         |
| `SUPABASE_PUBLISHABLE_KEY`      | server         | yes                    | Anon key for auth middleware      |
| `SUPABASE_SERVICE_ROLE_KEY`     | server         | **yes for live games** | Authoritative move writes; secret |

> Without `SUPABASE_SERVICE_ROLE_KEY`, `submitMove` fails (live multiplayer moves won't commit). Vs-computer, puzzles, and all reads still work.

## Local

```bash
npm ci
npm run dev          # development
npm run build && npm run start   # production-style (SSR via vite preview on :8080)
```

## Docker

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://<ref>.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key> \
  -t chessox .

docker run -p 8080:8080 \
  -e SUPABASE_URL=https://<ref>.supabase.co \
  -e SUPABASE_PUBLISHABLE_KEY=<anon-key> \
  -e SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  chessox
```

The image is multi-stage, runs as the non-root `node` user, and has a
`HEALTHCHECK` against `/healthz`.

## CI

`.github/workflows/ci.yml` runs typecheck → lint → tests → build on every push/PR.

## Serving model

This project's TanStack-Start/Vite config emits an SSR bundle (`dist/server/server.js` + `dist/client/`) served by `vite preview`. That is the supported serve path for this managed stack. If you migrate to a standalone Node/Cloudflare target, configure the Nitro preset accordingly and update `start`/Dockerfile — `src/server.ts` already exports a standard `{ fetch }` handler.

## Pre-deploy checklist

- [ ] Migrations applied; `types.ts` regenerated.
- [ ] All env vars set (incl. service role key).
- [ ] `npm run typecheck && npm run lint && npm test && npm run build` pass.
- [ ] `/healthz` returns 200 behind the load balancer.
