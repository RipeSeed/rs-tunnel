# @ripeseed/shared

Shared Zod schemas and TypeScript types used by `rs-tunnel` services and clients.

## Install

```bash
npm i @ripeseed/shared zod
```

## What It Provides

- Request/response schemas for auth and tunnel lifecycle APIs.
- Telemetry schemas (live metrics, historical metrics, request logs).
- Shared utility constants like `tunnelSlugRegex`.
- Inferred TypeScript types from the same schemas.

## Usage

```ts
import {
  tunnelCreateRequestSchema,
  tunnelCreateResponseSchema,
  type TunnelCreateResponse,
} from '@ripeseed/shared';

const request = tunnelCreateRequestSchema.parse({
  port: 3000,
  requestedSlug: 'my-app',
});

const response = tunnelCreateResponseSchema.parse({
  tunnelId: '11111111-1111-1111-1111-111111111111',
  hostname: 'my-app.tunnel.example.com',
  cloudflaredToken: 'token',
  heartbeatIntervalSec: 20,
});

const typed: TunnelCreateResponse = response;
console.log(request.port, typed.hostname);
```

## Main Exports

- Auth: `authStartRequestSchema`, `authStartResponseSchema`, `authExchangeRequestSchema`, `tokenPairSchema`
- Tunnel lifecycle: `tunnelCreateRequestSchema`, `tunnelCreateResponseSchema`, `heartbeatResponseSchema`, `tunnelSummarySchema`
- Telemetry: `tunnelTelemetryIngestRequestSchema`, `tunnelLiveTelemetrySchema`, `tunnelMetricsPointSchema`, `tunnelRequestLogSchema`
- Errors: `apiErrorSchema`

## Compatibility

Use compatible versions of `@ripeseed/shared` with `@ripeseed/api` and `@ripeseed/rs-tunnel` to avoid contract drift.

## Repository

- Monorepo: https://github.com/RipeSeed/rs-tunnel
- Source folder: https://github.com/RipeSeed/rs-tunnel/tree/main/packages/shared

