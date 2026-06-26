# ChessOx — Maintenance Runbook

## Day-to-day

- **Logs:** structured JSON in production (`src/lib/logger.ts`). Filter by `level` and `message`. Ship stdout to your aggregator (Datadog/Loki/CloudWatch).
- **Health:** `GET /healthz`. Wire to uptime monitoring; the Docker `HEALTHCHECK` already polls it.
- **Errors:** unhandled SSR errors render `lib/error-page.ts` and are logged with `Unhandled SSR error`. Client errors report through `lib/lovable-error-reporting.ts`.

## Common tasks

### Add/modify a DB object

1. Add a new file under `supabase/migrations/` (timestamp-prefixed). Make it idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` + `CREATE POLICY`).
2. Apply (`supabase db push`).
3. Regenerate types: `supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts`.
4. `npm run typecheck`.

### Add a server-authoritative action

- Non-chess transition → add a `SECURITY DEFINER` RPC + a wrapper in `gameClient.ts` + a type entry in `types.ts` Functions.
- Chess-dependent → extend the `makeMove` server fn (validate with chess.js, write via service role).

### Rotate the service role key

Update `SUPABASE_SERVICE_ROLE_KEY` in the deployment secret store and redeploy. No code change.

## Known limitations / backlog

- **Rate limiting** is per-instance in memory (`lib/rate-limit.ts`). For multi-instance, back it with Redis/Upstash behind the same API.
- **Abandoned games** resolve when the opponent loads the board (auto `claim_timeout`) — there is no server cron sweeping stale games. Add a scheduled job calling `claim_timeout` for long-idle active games if needed.
- **CSP** allows `'unsafe-inline'` for scripts/styles (framework hydration + Tailwind). Tighten with nonces if the framework gains support.
- **Payments** (`subscriptions` table, `premium.tsx`) are a stub — no provider wired.
- **Admin UI** is not built; admin RLS (`has_role`) works, so content can be managed via SQL/service role.
- **Matchmaking** pairs by exact time control (rating-band widening is a future enhancement).

## Test & verify

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Tests live next to code as `*.test.ts` (engine, rate-limit, dates). Add tests for new pure logic.
