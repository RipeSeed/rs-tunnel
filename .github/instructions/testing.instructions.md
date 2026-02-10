---
appliesTo:
  - "apps/api/test/**/*.ts"
  - "apps/cli/**/*.test.ts"
---

# Testing Instructions

These instructions apply to all test files.

## Test Framework

- Use Vitest as the test framework
- Use `describe()` for grouping related tests
- Use `it()` or `test()` for individual test cases
- Use `beforeEach()` / `afterEach()` for setup/cleanup

## Test Organization

- **Unit tests**: `apps/api/test/unit/` - test individual functions/classes
- **Integration tests**: `apps/api/test/integration/` - test full request/response cycle
- **CLI tests**: Co-located with source files (e.g., `up.test.ts` next to `up.ts`)

## Mocking Patterns

- Use `vi.fn()` for Vitest mocks
- Use `mockResolvedValue()` for async mocks that succeed
- Use `mockRejectedValue()` for async mocks that fail
- Mock external dependencies (API calls, database, child processes)
- Don't mock internal business logic

## API Testing

- Mock `Repository` and external services (Cloudflare, Slack)
- Use real Fastify app instance for integration tests
- Test both success and error paths
- Verify response status codes and body structure
- Test authentication/authorization guards

## CLI Testing

- Use dependency injection to mock API client, process spawning, file I/O
- Mock streams with EventEmitter + PassThrough
- Test command exit codes
- Test error message formatting
- Verify user-facing output

## Assertions

- Be explicit: `expect(actual).toBe(expected)` not `expect(actual).toBeTruthy()`
- Test error cases: `expect(() => fn()).toThrow()`
- Verify async rejections: `await expect(fn()).rejects.toThrow()`
- Check object shape: `expect(result).toMatchObject({ ... })`

## Test Coverage Goals

- Aim for 80%+ coverage on business logic
- 100% coverage on critical paths (auth, payment, security)
- Don't test trivial getters/setters
- Focus on behavior, not implementation details

## Common Patterns

- **Setup shared test data**: Use helper functions or fixtures
- **Cleanup**: Use `afterEach()` to reset mocks and clean up resources
- **Async tests**: Always `await` async operations; use `async` keyword on test function
- **Error testing**: Verify error code, message, and statusCode (not just "throws")

## What NOT to Test

- Third-party library internals
- Type definitions (TypeScript handles this)
- Obvious pass-throughs
- Generated code (e.g., Drizzle migrations)
