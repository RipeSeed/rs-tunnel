# GitHub Copilot Instructions for rs-tunnel

These instructions apply to all generated code in this repository.

## Context

This is a TypeScript monorepo (`pnpm` + `turbo`) with:

- API: `apps/api`
- CLI: `apps/cli`
- Shared contracts: `packages/shared`

The product is a self-hostable tunnel platform with Cloudflare + Slack OAuth.

## Hard requirements

- Keep TypeScript strict compatibility.
- Use ESM imports and include `.js` suffix for local imports.
- Use shared contracts/schemas from `@ripeseed/shared` for cross-app payloads.
- Do not bypass API ownership of Cloudflare actions.
- Do not place provider secrets in CLI code.

## Behavior constraints

- Only emails matching configured `ALLOWED_EMAIL_DOMAIN` are allowed.
- Slack workspace must match configured `ALLOWED_SLACK_TEAM_ID`.
- Slugs must be single-label only (no nested domains).
- Max active tunnels per user is 5.
- Stopping tunnel must remove DNS and Cloudflare tunnel.

## Coding preferences

- Prefer explicit return types on exported functions.
- Keep functions small and composable.
- Avoid broad refactors unless requested.
- Add/update tests when behavior changes.
- Keep error codes/messages consistent with existing API patterns.

## API conventions

- Validate request bodies with Zod.
- Throw `AppError` for expected application errors.
- Keep route handlers thin; put business logic in services.
- Keep idempotency on cleanup operations (`DELETE`, stale cleanup).

## CLI conventions

- Commands should be deterministic and script-friendly.
- Print clear user-facing errors.
- Retry auth-dependent calls by refreshing session on 401.
- Keep `cloudflared` install logic cross-platform and checksum-verified.
- `rs-tunnel up` must preserve ngrok-style runtime output:
  - Header fields: `Account`, `Version`, `Region`, `Latency`, `Forwarding`
  - Connections row: `ttl`, `opn`, `rt1`, `rt5`, `p50`, `p90`
  - Request log lines under `HTTP Requests`
- `rs-tunnel up --verbose` should include raw `cloudflared` logs in addition to dashboard output.
- Region/latency values are best-effort and should gracefully fall back to `n/a`.
- Connection/latency metrics in CLI output are local proxy-derived approximations.

## Build and release expectations

- `@ripeseed/shared` must be built/published before CLI build/publish.
- Keep CI/release workflow compatible with `packageManager: pnpm@10.0.0`.
- Do not reintroduce compose `version` key in `docker-compose.yml`.

## Update docs when changing behavior

If command semantics, env vars, auth flow, or release flow changes, update:

- `README.md`
- `.env.example`
- `AGENTS.md`
