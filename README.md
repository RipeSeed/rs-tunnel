# rs-tunnel

Internal Ripeseed tunnel platform backed by Cloudflare. It provides an installable CLI for team members and an internal API that controls identity, tunnel creation, and DNS cleanup.

## What this project does

- Exposes local HTTP services at `https://<slug>.tunnel.ripeseed.io`
- Authenticates users via Slack OAuth + `@ripeseed.io` domain check
- Limits each user to 5 active tunnels
- Creates and deletes Cloudflare DNS records automatically
- Cleans stale tunnels when the client stops heartbeating

## Architecture

- CLI package: `@ripeseed/rs-tunnel`
- API service: `@ripeseed/api` (Fastify + Postgres + Drizzle)
- Shared package: `@ripeseed/shared` (Zod schemas + contracts)
- Domain: `*.tunnel.ripeseed.io`
- API endpoint: `https://api-tunnel.internal.ripeseed.io`

High-level flow:

1. `rs-tunnel login --email user@ripeseed.io`
2. CLI opens Slack OAuth via API
3. API verifies email + workspace and issues tokens
4. `rs-tunnel up --port 3000 [--url my-app]`
5. API creates Cloudflare tunnel + DNS
6. CLI runs `cloudflared` and heartbeats every 20s
7. `rs-tunnel stop ...` deletes DNS and tunnel

## Repository layout

- `apps/api`: API source, routes, services, migrations, tests
- `apps/cli`: CLI source and command implementations
- `packages/shared`: cross-app contracts/types
- `packages/config`: shared lint/format/ts config
- `.github/workflows`: CI + release pipelines

## Prerequisites

- Node.js 20+
- pnpm 10 (from `packageManager`)
- Docker (for local Postgres)
- Slack app credentials
- Cloudflare account + zone/token

## Environment variables

Create `.env` in repo root or `apps/api/.env`.

### Core API

- `API_BASE_URL`
  - Local: `http://localhost:8080`
  - Prod: `https://api-tunnel.internal.ripeseed.io`
- `PORT` (default `8080`)
- `DATABASE_URL` (Postgres connection string)
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`

### Slack

- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_REDIRECT_URI`
  - Local example: `http://localhost:8080/v1/auth/slack/callback`
  - Prod example: `https://api-tunnel.internal.ripeseed.io/v1/auth/slack/callback`
- `RIPSEED_SLACK_TEAM_ID`

### Cloudflare

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_BASE_DOMAIN` (default `tunnel.ripeseed.io`)

### Behavior controls

- `JWT_ACCESS_TTL_MINUTES` (default `15`)
- `REFRESH_TTL_DAYS` (default `30`)
- `MAX_ACTIVE_TUNNELS` (default `5`)
- `HEARTBEAT_INTERVAL_SEC` (default `20`)
- `LEASE_TIMEOUT_SEC` (default `60`)
- `REAPER_INTERVAL_SEC` (default `30`)

### CLI override

- `RS_TUNNEL_API_BASE_URL`
  - Use `http://localhost:8080` for local dev

## Local development

1. Install dependencies:

```bash
pnpm install
```

2. Start Postgres:

```bash
docker compose up -d postgres
```

3. Run migrations:

```bash
pnpm --filter @ripeseed/api db:migrate
```

4. Start API:

```bash
pnpm --filter @ripeseed/api dev
```

5. In a new terminal, use CLI against local API:

```bash
export RS_TUNNEL_API_BASE_URL=http://localhost:8080
pnpm --filter @ripeseed/rs-tunnel exec tsx src/index.ts doctor
pnpm --filter @ripeseed/rs-tunnel exec tsx src/index.ts login --email you@ripeseed.io
pnpm --filter @ripeseed/rs-tunnel exec tsx src/index.ts up --port 3000 --url my-app
```

6. Stop tunnel:

```bash
pnpm --filter @ripeseed/rs-tunnel exec tsx src/index.ts stop my-app.tunnel.ripeseed.io
```

## CLI commands

```bash
rs-tunnel login --email you@ripeseed.io
rs-tunnel up --port 3000
rs-tunnel up --port 3000 --url my-app
rs-tunnel list
rs-tunnel stop <tunnel-id-or-hostname>
rs-tunnel logout
rs-tunnel doctor
```

## Quality checks

Run from repo root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Docker API run

To run API + Postgres in Compose:

```bash
docker compose up --build
```

Note:

- `docker-compose.yml` is intentionally versionless (Compose V2 format).
- Ensure all required env vars are exported or in `.env` before `up`.

## Publishing to GitHub Packages

This repo publishes two packages:

- `@ripeseed/shared`
- `@ripeseed/rs-tunnel`

Release is tag-driven via `.github/workflows/release.yml`.

### Release flow

1. Commit and push changes.
2. Create annotated tag:

```bash
git tag -a v0.1.0 -m "Initial release"
git push origin v0.1.0
```

3. Workflow publishes `@ripeseed/shared` first, then `@ripeseed/rs-tunnel`.

### Consumer install

```bash
npm config set @ripeseed:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken <GITHUB_TOKEN_WITH_READ_PACKAGES>
npm i -g @ripeseed/rs-tunnel
```

## Troubleshooting

### `Cannot find module '@ripeseed/shared'`

Cause: shared package not built/published first.

Fix:

- Build shared before dependent packages.
- Keep release workflow order: publish shared, then CLI.

### `Can't find meta/_journal.json` during migrate

Cause: Drizzle migration metadata missing.

Fix: ensure `apps/api/drizzle/meta/_journal.json` exists.

### `client password must be a string`

Cause: bad or unloaded `DATABASE_URL`.

Fix: validate `.env` loading and full connection string.

### Slack OAuth callback fails

Cause: redirect URI mismatch.

Fix: `SLACK_REDIRECT_URI` must exactly match app config and environment.

## License

Internal Ripeseed project (private usage).
