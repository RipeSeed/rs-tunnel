---
appliesTo:
  - apps/cli/**/*.ts
---

# CLI-Specific Instructions

These instructions apply to the CLI in `apps/cli`.

## Command Structure

- Commands are async functions in `src/commands/` folder
- Export single function per file with consistent naming: `xyzCommand`
- Accept parsed options as typed objects (never raw `commander` args)
- Use dependency injection pattern for testability (accept optional dependencies object)
- Return exit codes: 0 for success, non-zero for errors

## Credential Storage

- Use dual-layer credential storage: keytar (preferred) → file-based (fallback)
- Primary: Optional `keytar` dependency for OS credential managers
- Fallback: AES-256-GCM encrypted JSON at `~/.rs-tunnel/session.enc`
- Encryption key: Random 32-byte key stored at `~/.rs-tunnel/session.key` (mode 0o600)
- Always try keytar first; gracefully degrade to file-based on failure
- Session structure: `StoredSession` with access/refresh tokens and `UserProfile`

## Session Management

- Use `withAuthenticatedSession()` wrapper for auto-refresh on 401
- Implement 30-second token expiration headroom to avoid race conditions
- Clear session completely on refresh failure (force re-login)
- Never log or display access/refresh tokens

## Cloudflared Binary Management

- Multi-tier installation strategy (in order):
  1. Check `RS_TUNNEL_CLOUDFLARED_PATH` env override
  2. Check if `cloudflared` exists in system PATH
  3. Check bundled binary in `~/.rs-tunnel/bin/`
  4. Download from GitHub latest release with SHA256 verification
  5. Try package managers (brew, apt-get/dnf, pacman, winget) as last resort
- Platform detection via `os.platform()` / `os.arch()` mapping
- Always verify SHA256 checksum before using downloaded binary
- Set file permissions to 0o755 on Unix-like systems
- Cache installed binaries in `~/.rs-tunnel/bin/`

## Dashboard Output (ngrok-style)

- Header fields: Account, Version, Region, Latency, Forwarding
- Metrics row: ttl, opn, rt1, rt5, p50, p90
- HTTP request log stream with timestamp/method/path/status
- Max 120 log lines buffer
- Gracefully handle missing metrics with "n/a"
- `--verbose` flag includes raw cloudflared output alongside dashboard

## Local Proxy Patterns

- HTTP server with WebSocket upgrade support
- Track request events: method, path, status, duration, bytes
- Emit connection snapshots (total/open connections)
- Per-request timing via `process.hrtime.bigint()`
- Bind to ephemeral port (0) and let OS assign
- Proper cleanup on shutdown (close all connections)

## Cloudflared Integration

- Parse stderr for `location=` lines to extract region info
- Only emit raw logs to dashboard when `--verbose` enabled
- Preserve ngrok-compatible output format for user familiarity
- Handle cloudflared process lifecycle: spawn, monitor, kill on shutdown

## Process Signal Handling

- Register SIGINT handler for graceful shutdown
- Cleanup order: kill child process → stop tunnel → stop proxy → stop dashboard
- Use appropriate exit code: SIGINT = 130
- Ensure all resources are released before exit

## Testing Patterns

- Use dependency injection for testability (optional dependencies object)
- Mock streams: EventEmitter + PassThrough for fake child processes
- Process management mocks: `processRef` mocks simulate signal handling
- Fixture builders: Helper functions for creating fake processes, listeners, API clients
- Test both happy path and error scenarios (especially network failures)

## Error Messaging

- Print clear, actionable user-facing errors
- Include suggestions for common issues (e.g., "Run 'rs-tunnel login' first")
- Use `chalk` for colored output (red for errors, yellow for warnings, green for success)
- Keep error messages concise (1-2 lines)
- Don't expose internal stack traces to users unless `--verbose` enabled

## Cross-Platform Considerations

- Use `path.join()` for all file paths (never string concatenation)
- Use `os.homedir()` for user home directory
- Handle Windows-specific cases (no file permissions, different binary names)
- Test platform detection logic with all supported combinations
- Use `process.platform` for OS checks, `process.arch` for architecture
