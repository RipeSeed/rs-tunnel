# Contributing

Thanks for contributing to `rs-tunnel`.

## Development Setup

1. Install dependencies:

```bash
pnpm install
```

2. Start Postgres:

```bash
docker compose up -d postgres
```

3. Run DB migrations:

```bash
pnpm --filter @ripeseed/api db:migrate
```

4. Start API and CLI dev flows:

```bash
pnpm --filter @ripeseed/api dev
pnpm --filter @ripeseed/rs-tunnel dev
```

## Project Rules

- Use TypeScript strict mode.
- Use ESM imports with `.js` suffix for local source imports.
- Keep Cloudflare provider credentials in API only.
- Keep API and CLI payload contracts in `@ripeseed/shared`.
- Add or update tests for behavioral changes.

## Before Opening a PR

Run from repo root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Pull Requests

- Keep PRs focused and small where possible.
- Include context, rationale, and test evidence.
- Update docs (`README.md`, `.env.example`) when setup, env vars, or command behavior changes.

## Security

Do not open public issues for sensitive security reports. See [SECURITY.md](./SECURITY.md).
