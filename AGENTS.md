# AGENTS.md

Operational guide for engineers and AI coding agents working in `rs-tunnel`.

## Mission

`rs-tunnel` is an internal Ripeseed alternative to ngrok:

- CLI: `@ripeseed/rs-tunnel`
- API: `@ripeseed/api`
- Shared contracts: `@ripeseed/shared`
- Domain model: `*.tunnel.ripeseed.io`
- API host: `api-tunnel.internal.ripeseed.io`

The API is the source of truth for identity, authorization, Cloudflare tunnel lifecycle, and DNS lifecycle.

## Monorepo map

- `apps/api`: Fastify API + Drizzle + Postgres + cleanup worker
- `apps/cli`: user CLI (`login`, `up`, `list`, `stop`, `logout`, `doctor`)
- `packages/shared`: Zod contracts/types consumed by API and CLI
- `packages/config`: shared tooling config
- `.github/workflows`: CI/release pipelines

## Non-negotiable product constraints

- Only `@ripeseed.io` emails are allowed.
- Slack workspace must match configured allowlist (`RIPSEED_SLACK_TEAM_ID`).
- No nested domains: slugs must be single-label only.
- Max 5 active tunnels per user (server-side enforcement).
- On stop, DNS record must be deleted.
- If client dies, stale lease cleanup must remove tunnel + DNS.
- CLI must never hold Cloudflare API credentials.

## Security model

- Provider secrets (`CLOUDFLARE_API_TOKEN`, Slack secrets, JWT secrets) belong only in API runtime.
- CLI receives short-lived tunnel run token from API; never provider token.
- Do not log secrets, JWTs, refresh tokens, or Cloudflare tokens.
- Keep least-privilege scopes for Cloudflare token (Tunnel + DNS only).

## Development workflow

1. Install dependencies:

```bash
pnpm install
```

2. Start Postgres:

```bash
docker compose up -d postgres
```

3. Migrate DB:

```bash
pnpm --filter @ripeseed/api db:migrate
```

4. Run API:

```bash
pnpm --filter @ripeseed/api dev
```

5. Run CLI against local API:

```bash
export RS_TUNNEL_API_BASE_URL=http://localhost:8080
pnpm --filter @ripeseed/rs-tunnel exec tsx src/index.ts login --email you@ripeseed.io
```

## Quality gates before push

Run all:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected behavior:

- Lint/typecheck/test/build pass in CI and local.
- API tests cover slug rules, quota, auth gates, and cleanup behavior.

## Release model

Release is tag-driven (`v*.*.*`) via `.github/workflows/release.yml`.

Workflow order must remain:

1. Install
2. Build + publish `@ripeseed/shared`
3. Build + publish `@ripeseed/rs-tunnel`

Reason: CLI depends on shared package in registry.

## Known failure modes and fixes

1. `Cannot find module '@ripeseed/shared'` during build/typecheck:
- Ensure `@ripeseed/shared` is built/published first.
- Keep turbo dependency graph (`typecheck` depends on `^build`).

2. Drizzle migrate error `Can't find meta/_journal.json`:
- Ensure `apps/api/drizzle/meta/_journal.json` exists.

3. DB auth error `client password must be a string`:
- Validate `DATABASE_URL` is loaded and complete.
- Use `apps/api/.env` or repo-root `.env`.

4. Docker warning about compose `version`:
- Do not add `version` back to `docker-compose.yml`.

## Code style and conventions

- TypeScript strict mode; avoid `any` unless unavoidable.
- ESM imports with `.js` suffix in source imports.
- Use shared Zod contracts from `@ripeseed/shared` for API/CLI payloads.
- Keep public behavior backward-compatible for CLI commands.
- Keep comments concise and only where logic is non-obvious.

## Pull request checklist

- Tests for behavioral changes are included/updated.
- README and `.env.example` updated if setup or env behavior changed.
- No secret values in committed files.
- Release pipeline impact considered if dependency/public package changed.
