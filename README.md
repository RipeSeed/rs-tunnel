# rs-tunnel

`rs-tunnel` is a Cloudflare tunnel platform with:

- CLI: `@ripeseed/rs-tunnel`
- API: `@ripeseed/api`
- Admin web app: `@ripeseed/admin-web`
- Shared contracts: `@ripeseed/shared`

It creates secure public hostnames for localhost services, enforces auth policy, manages Cloudflare tunnel + DNS lifecycle, and cleans stale sessions.

## What it does

- Exposes local HTTP services at `https://<slug>.<base-domain>`
- Authenticates users through Slack OpenID
- Enforces max active tunnels per user (default: `5`)
- Creates/deletes DNS records with tunnel lifecycle
- Reaps stale leases when clients stop heartbeating

## Architecture

- `apps/api`: Fastify API + Drizzle + Postgres + cleanup worker
- `apps/web`: owner-only Next.js admin panel for self-hosted operators
- `apps/cli`: CLI (`login`, `up`, `list`, `stop`, `logout`, `doctor`)
- `packages/shared`: shared Zod schemas/contracts
- `packages/config`: shared lint/format/TypeScript config

High-level flow:

1. `rs-tunnel login --email user@example.com`
2. CLI starts OAuth through API
3. API verifies email domain + Slack workspace and issues short-lived tokens
4. `rs-tunnel up --port 3000 [--url my-app]`
5. API creates Cloudflare tunnel + DNS
6. CLI runs local reverse proxy + `cloudflared` and heartbeats every 20 seconds
7. `rs-tunnel stop ...` removes DNS and tunnel

## Admin panel

The repo includes a private admin console in `apps/web`.

- The first successful Slack login to the web app becomes the instance owner.
- Existing CLI/API users are unchanged; the owner-only rule applies only to the admin panel in v1.
- Slack OAuth still runs through the API. The web app stores an encrypted server-side session cookie and makes server-to-server API calls.

V1 dashboard coverage:

- Total users
- Active tunnels
- Live open connections
- 24 hour requests
- 24 hour error rate
- 24 hour transferred bytes
- Pending cleanup jobs
- Tunnel status breakdown
- Live tunnels table
- Users table
- Recent activity

## Prerequisites

- Node.js 20+
- pnpm 10
- Docker (for local Postgres)
- Slack app credentials
- Cloudflare account/token with tunnel + DNS permissions

## Environment variables

Create `.env` in repo root or `apps/api/.env`.

### Core API

- `API_BASE_URL`
  - Local: `http://localhost:8080`
  - Deployments: your public API base URL
- `ADMIN_WEB_BASE_URL`
  - Local: `http://localhost:3001`
  - Deployments: your public admin web base URL
- `PORT` (default: `8080`)
- `DATABASE_URL`
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`

### Access policy

- `ALLOWED_EMAIL_DOMAIN` (default: `@example.com`)
- `ALLOWED_SLACK_TEAM_ID` (required)

Compatibility fallback:

- `RIPSEED_SLACK_TEAM_ID` is still accepted as a fallback for `ALLOWED_SLACK_TEAM_ID`

### Slack

- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_REDIRECT_URI` (example: `http://localhost:8080/v1/auth/slack/callback`)

### Cloudflare

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_BASE_DOMAIN` (default: `tunnel.example.com`)

### Behavior controls

- `JWT_ACCESS_TTL_MINUTES` (default: `15`)
- `REFRESH_TTL_DAYS` (default: `30`)
- `MAX_ACTIVE_TUNNELS` (default: `5`)
- `HEARTBEAT_INTERVAL_SEC` (default: `20`)
- `LEASE_TIMEOUT_SEC` (default: `60`)
- `REAPER_INTERVAL_SEC` (default: `30`)

### CLI

- `RS_TUNNEL_API_URL` (recommended global API URL override, default: `http://localhost:8080`)
- `RS_TUNNEL_API_BASE_URL` (legacy alias for backward compatibility)

### Admin web app

- `ADMIN_SESSION_SECRET` (required encrypted cookie secret)
- `RS_TUNNEL_API_URL` (required API base URL used by the web app)

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

5. Start the admin web app:

```bash
export RS_TUNNEL_API_URL=http://localhost:8080
export ADMIN_SESSION_SECRET=replace-me-with-a-long-random-string
pnpm --filter @ripeseed/admin-web dev -- --port 3001
```

6. Run CLI against local API:

```bash
export RS_TUNNEL_API_URL=http://localhost:8080
pnpm --filter @ripeseed/rs-tunnel exec tsx src/index.ts doctor
pnpm --filter @ripeseed/rs-tunnel exec tsx src/index.ts login --email you@example.com
pnpm --filter @ripeseed/rs-tunnel exec tsx src/index.ts login --email you@example.com --skip-browser-open
pnpm --filter @ripeseed/rs-tunnel exec tsx src/index.ts up --port 3000 --url my-app
```

7. Open the admin panel at `http://localhost:3001`

The first successful Slack login to the web app claims the owner seat for that deployment.

## CLI commands

```bash
rs-tunnel login --email you@example.com
rs-tunnel login --email you@example.com --skip-browser-open
rs-tunnel up --port 3000
rs-tunnel up --port 3000 --url my-app
rs-tunnel up --port 3000 --verbose
rs-tunnel list
rs-tunnel stop <tunnel-id-or-hostname>
rs-tunnel logout
rs-tunnel doctor
```

### Self-hosted API Domain (Infisical-style)

The CLI supports command-level `--domain` overrides, similar to Infisical:

```bash
rs-tunnel login --email you@example.com --domain https://api.your-company.com
rs-tunnel up --port 3000 --domain https://api.your-company.com
```

Important:

- `--domain` applies immediately to the current command and is also saved locally for future commands.
- On first run (if no env/domain is configured), CLI prompts for the API domain and saves it to `~/.rs-tunnel/config.json`.
- For global shell-level config, set `RS_TUNNEL_API_URL`.
- `rs-tunnel login --skip-browser-open` skips automatically opening the browser, prints the Slack authorize URL, and keeps waiting for the API-side auth flow to complete, which is useful when another tool needs to forward the link to the user.

## Runtime dashboard (`up`)

`rs-tunnel up` renders an ngrok-style dashboard with:

- Header: `Account`, `Version`, `Region`, `Latency`, `Forwarding`
- Connections row: `ttl`, `opn`, `rt1`, `rt5`, `p50`, `p90`
- Live HTTP request stream
- `--verbose`: includes raw `cloudflared` output in the stream

Notes:

- Region/latency are best-effort and can show `n/a`
- Metrics are proxy-derived approximations, not Cloudflare-native telemetry

## Quality checks

Run from repo root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Docker compose

The compose stack includes Postgres, the API, and the admin web app.

```bash
docker compose up -d postgres api web
```

Default local URLs:

- API: `http://localhost:8080`
- Admin web: `http://localhost:3001`

## Release / publishing

Release is tag-driven (`v*.*.*`) via `.github/workflows/release.yml`.

Publish order:

1. `@ripeseed/shared`
2. `@ripeseed/rs-tunnel`

Registry target: npmjs (`https://registry.npmjs.org`).

Required GitHub Actions secret:

- `NPM_TOKEN` (token with publish rights for the package scope)

Install example:

```bash
npm i -g @ripeseed/rs-tunnel
```

## Troubleshooting

### `Cannot find module '@ripeseed/shared'`

Build/publish shared before dependent packages.

### `Can't find meta/_journal.json` during migrate

Ensure `apps/api/drizzle/meta/_journal.json` exists.

### `client password must be a string`

Verify `DATABASE_URL` is loaded and complete.

### Slack OAuth callback fails

Ensure `SLACK_REDIRECT_URI` exactly matches Slack app configuration.

### CLI tests fail with `listen EPERM`

`apps/cli/src/lib/local-proxy.test.ts` requires local socket bind permissions.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md), [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md), and [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
