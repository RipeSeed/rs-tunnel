---
appliesTo:
  - apps/api/**/*.ts
---

# API-Specific Instructions

These instructions apply to the Fastify API in `apps/api`.

## Service Layer Pattern

- Services receive dependencies via constructor: `Env`, `Repository`, and other services
- Implement interfaces from `src/types.ts` (e.g., `AuthService implements AuthServiceContract`)
- Throw `AppError(statusCode, code, message, details?)` for all expected errors
- Never return error values; use exceptions for control flow

## Drizzle ORM Patterns

- Use `Repository` singleton for all data access; never query directly
- Type query results by destructuring: `const [row] = await db.select()...`
- Infer types from schema: `export type DbXxx = typeof xxxTable.$inferSelect`
- Use `touchUpdatedAtSql` for optimistic locking patterns
- Cleanup operations must tolerate missing resources (idempotent)

## Route Registration

- Use `registerXxxRoutes(app: FastifyInstance)` pattern in `src/routes/`
- Validate request bodies with Zod schemas from `@ripeseed/shared`
- Protect routes with `{ preHandler: app.authenticate }` for authenticated endpoints
- Keep route handlers thin (3-10 lines); delegate all logic to services
- Return consistent error format: `{ code, message, details? }`

## Background Workers

- Use class-based pattern with `start()` / `stop()` lifecycle methods
- Register in `src/workers/index.ts` and manage in main app
- Workers must be idempotent and handle missing resources gracefully
- Use `setTimeout` recursion for periodic tasks (not `setInterval`)

## Lease-Based Tunnel Lifecycle

- Tunnels require periodic heartbeat to extend `expiresAt`
- Heartbeat interval: `HEARTBEAT_INTERVAL_SEC` from env
- Lease timeout: `LEASE_TIMEOUT_SEC` from env
- Expired tunnels cleaned up by reaper worker
- Heartbeat route must be unauthenticated (accepts tunnel run token)

## Testing Conventions

- Mock `Repository` and external services; use real Fastify app for integration tests
- Use Vitest `vi.fn()` with `mockResolvedValue()` for async mocks
- Test both happy path and error cases
- Test idempotent cleanup behavior (cleanup with missing resources must succeed)
- Integration tests should cover full request/response cycle

## Error Code Conventions

Use these established error codes consistently:
- `INVALID_INPUT` - validation errors (400)
- `MISSING_AUTH` - authentication required (401)
- `FORBIDDEN` - insufficient permissions (403)
- `NOT_FOUND` - resource not found (404)
- `QUOTA_EXCEEDED` - user limit reached (429)
- `CLOUDFLARE_ERROR` - Cloudflare API failure (502)
- `SLACK_OAUTH_DENIED` - OAuth flow rejected (403)

## Cloudflare Integration

- Always use `CloudflareService` methods; never call Cloudflare API directly
- Wrap Cloudflare API calls in try/catch
- Treat 404 responses as success in cleanup operations (idempotent)
- Log Cloudflare errors with request/response details for debugging
- Never log or return Cloudflare API tokens

## Audit Logging

- Call `repository.createAuditLog()` after significant user actions
- Log tunnel lifecycle events: create, stop, delete
- Include userId, resource type, resource ID, and action
- Keep audit log writes non-blocking (fire-and-forget)
