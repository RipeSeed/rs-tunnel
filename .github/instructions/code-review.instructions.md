# Code Review Instructions

These instructions guide code reviews for pull requests in the rs-tunnel repository.

## Security Review

### Secrets and Credentials
- [ ] Verify no secrets, API tokens, or credentials are committed
- [ ] Check that `CLOUDFLARE_API_TOKEN`, `SLACK_*` secrets remain in API only, never in CLI
- [ ] Ensure JWTs, refresh tokens, and Cloudflare tokens are not logged
- [ ] Validate that session tokens are stored securely (keytar or encrypted file in CLI)

### Authentication and Authorization
- [ ] Verify configured email domain enforcement (`ALLOWED_EMAIL_DOMAIN`) is maintained
- [ ] Check Slack workspace team ID validation is present
- [ ] Ensure authenticated routes use `{ preHandler: app.authenticate }`
- [ ] Validate user quota enforcement (max 5 active tunnels per user)

### Input Validation
- [ ] Confirm all API request bodies are validated with Zod schemas from `@ripeseed/shared`
- [ ] Check slug validation enforces single-label only (no nested domains)
- [ ] Verify user input sanitization to prevent injection attacks
- [ ] Ensure file paths use `path.join()` to prevent path traversal

## Testing Requirements

### Test Coverage
- [ ] New features include unit tests
- [ ] Critical paths (auth, tunnel lifecycle, cleanup) have tests
- [ ] Edge cases and error conditions are tested
- [ ] Tests follow existing patterns: Vitest with `vi.fn()` mocks

### Test Quality
- [ ] Tests use explicit assertions (`toBe`, `toEqual`, `toMatchObject`)
- [ ] Async tests properly `await` all operations
- [ ] Mocks are properly reset in `afterEach()` hooks
- [ ] Integration tests mock external services (Cloudflare, Slack) but use real app instances

### Test Patterns by Area
- **API tests**: Mock `Repository` and external services, verify response codes/bodies
- **CLI tests**: Use dependency injection with mocked API client and child processes
- **Shared tests**: Validate schema parsing with valid and invalid inputs

## Code Quality

### TypeScript Standards
- [ ] Strict mode compliance (no `any` without justification)
- [ ] Explicit return types on exported functions
- [ ] ESM imports with `.js` suffix for local imports
- [ ] Proper use of shared types from `@ripeseed/shared`

### Error Handling
- [ ] Services throw `AppError(statusCode, code, message, details?)` for expected errors
- [ ] Error codes are consistent with existing patterns (see API instructions)
- [ ] CLI displays user-friendly error messages with actionable suggestions
- [ ] Cleanup operations are idempotent (tolerate missing resources)

### Code Organization
- [ ] Functions are small and composable (avoid functions > 50 lines)
- [ ] Route handlers are thin (3-10 lines), business logic in services
- [ ] Services use dependency injection via constructor
- [ ] Repository pattern used for all database access (no direct queries)

## Architecture and Design

### Service Layer (API)
- [ ] Services implement interfaces from `src/types.ts`
- [ ] Services receive `Env`, `Repository`, and other services via constructor
- [ ] Business logic is in services, not route handlers
- [ ] Background workers use class-based pattern with `start()`/`stop()` lifecycle

### Database Patterns
- [ ] Use `Repository` singleton for all data access
- [ ] Type query results: `const [row] = await db.select()...`
- [ ] Use `touchUpdatedAtSql` for optimistic locking where appropriate
- [ ] Cleanup operations must be idempotent (handle 404s gracefully)

### Separation of Concerns
- [ ] No Cloudflare API secrets or logic in CLI (API owns all Cloudflare actions)
- [ ] Shared contracts in `@ripeseed/shared` for cross-app payloads
- [ ] CLI commands use dependency injection for testability
- [ ] Clear boundaries between API, CLI, and shared packages

## Performance and Scalability

### Resource Management
- [ ] Database connections are properly managed
- [ ] Child processes (cloudflared) are cleaned up on shutdown
- [ ] File handles and network connections are closed
- [ ] Memory leaks avoided (no unbounded arrays, proper event listener cleanup)

### Database Efficiency
- [ ] Queries use proper indexes (check schema definitions)
- [ ] Avoid N+1 query patterns
- [ ] Use pagination for list endpoints
- [ ] Lease-based cleanup prevents stale resource accumulation

### Background Tasks
- [ ] Workers use `setTimeout` recursion, not `setInterval`
- [ ] Cleanup jobs are idempotent and can be retried
- [ ] Heartbeat intervals are reasonable (not too frequent)

## Documentation and Comments

### Code Documentation
- [ ] Complex logic includes explanatory comments
- [ ] Comments explain "why", not "what" (code should be self-documenting)
- [ ] Keep comments concise and up-to-date
- [ ] Avoid obvious comments that restate the code

### User-Facing Documentation
- [ ] README.md updated if setup, commands, or env vars change
- [ ] `.env.example` updated if new environment variables added
- [ ] `AGENTS.md` updated if operational procedures change
- [ ] CLI help text is clear and accurate

## Breaking Changes and Compatibility

### API Compatibility
- [ ] Existing API endpoints maintain backward compatibility
- [ ] New error codes don't conflict with existing ones
- [ ] Response schemas remain compatible with existing clients
- [ ] Database migrations are reversible where possible

### CLI Compatibility
- [ ] Command behavior remains deterministic and script-friendly
- [ ] Breaking changes to CLI commands are clearly documented
- [ ] Session storage format changes handle migration
- [ ] ngrok-style output format preserved for `rs-tunnel up`

### Dependency Changes
- [ ] `@ripeseed/shared` version bumped if schemas change
- [ ] Package versions follow semantic versioning (patch/minor/major)
- [ ] Breaking changes coordinated between API and CLI
- [ ] Release order maintained: shared → API → CLI

## Specific Pattern Validation

### Cleanup and Idempotency
- [ ] Tunnel stop operations delete both DNS record and Cloudflare tunnel
- [ ] Cleanup tolerates already-deleted resources (treat 404 as success)
- [ ] `stopInternal` throws on failure so cleanup jobs can retry
- [ ] Partial unique index allows slug reuse after tunnel stops

### Lease-Based Lifecycle
- [ ] Tunnels require periodic heartbeat to extend `expiresAt`
- [ ] Heartbeat route accepts tunnel run token (not user auth)
- [ ] Expired tunnels cleaned up by reaper worker
- [ ] Heartbeat intervals and lease timeouts are configurable

### Cloudflared Integration (CLI)
- [ ] Binary management follows multi-tier strategy (env → PATH → bundled → download)
- [ ] SHA256 checksum verified before using downloaded binaries
- [ ] Cross-platform support maintained (Windows, macOS, Linux)
- [ ] Dashboard output preserves ngrok-style format

## Review Process

### Before Approving
- [ ] All CI checks pass (lint, typecheck, test, build)
- [ ] No console.log or debug statements left in code
- [ ] Git history is clean (no WIP commits or fixups in final PR)
- [ ] PR description explains what changed and why

### When Requesting Changes
- [ ] Feedback is specific and actionable
- [ ] Reference relevant instruction files or documentation
- [ ] Suggest concrete improvements with examples
- [ ] Distinguish between required changes and optional suggestions

## Common Issues to Flag

### Security Red Flags
- ⚠️ Secrets in code or logs
- ⚠️ Missing input validation
- ⚠️ Authentication bypasses
- ⚠️ Unencrypted sensitive data storage

### Quality Red Flags
- ⚠️ Missing tests for new features
- ⚠️ Broad refactors mixing with feature changes
- ⚠️ Inconsistent error codes or handling
- ⚠️ Duplicate code that should be shared

### Architecture Red Flags
- ⚠️ CLI accessing Cloudflare API directly
- ⚠️ Database queries outside Repository
- ⚠️ Business logic in route handlers
- ⚠️ Provider secrets in CLI code

### Compatibility Red Flags
- ⚠️ Breaking API changes without version bump
- ⚠️ CLI behavior changes without documentation
- ⚠️ Shared schema changes without coordination
- ⚠️ Release order violations (shared not published first)
