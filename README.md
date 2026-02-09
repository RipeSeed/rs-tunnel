# rs-tunnel

Internal Ripeseed tunnel platform backed by Cloudflare, with a CLI that can be installed from GitHub Packages.

## Architecture

- CLI package: `@ripeseed/rs-tunnel`
- API service: Fastify + Postgres + Drizzle
- Tunnel domain: `*.tunnel.ripeseed.io`
- API domain: `https://api-tunnel.internal.ripeseed.io`
- Auth gate: Slack OAuth + `@ripeseed.io` domain + allowed workspace

## Monorepo packages

- `apps/cli`: CLI implementation
- `apps/api`: API implementation
- `packages/shared`: shared API contracts and validators
- `packages/config`: shared lint/format/tsconfig

## Local development

```bash
pnpm install
pnpm dev
```

### API only

```bash
pnpm --filter @ripeseed/api db:migrate
pnpm --filter @ripeseed/api dev
```

### CLI packaging

```bash
pnpm --filter @ripeseed/rs-tunnel build
```

## Install from GitHub Packages

1. Configure npm auth for GitHub Packages:

```bash
npm config set @ripeseed:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken <GITHUB_TOKEN_WITH_READ_PACKAGES>
```

2. Install globally:

```bash
npm i -g @ripeseed/rs-tunnel
```

## Key commands

```bash
rs-tunnel login --email you@ripeseed.io
rs-tunnel up --port 3000
rs-tunnel up --port 3000 --url my-app
rs-tunnel list
rs-tunnel stop <tunnel-id-or-hostname>
rs-tunnel logout
rs-tunnel doctor
```
