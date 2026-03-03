# @ripeseed/rs-tunnel

CLI for exposing your local HTTP service through a self-hosted `rs-tunnel` API and Cloudflare Tunnel.

## Install

```bash
npm i -g @ripeseed/rs-tunnel
```

## Quick Start

```bash
# point CLI to your deployed API
export RS_TUNNEL_API_URL=https://api.your-domain.com

# authenticate
rs-tunnel login --email you@your-company.com

# expose local app on port 3000
rs-tunnel up --port 3000
```

If no API URL is configured, the CLI prompts once and stores it in `~/.rs-tunnel/config.json`.

## Commands

```bash
rs-tunnel login --email <email> [--domain <api-url>]
rs-tunnel up --port <port> [--url <slug>] [--verbose] [--domain <api-url>]
rs-tunnel list [--domain <api-url>]
rs-tunnel stop <tunnel-id-or-hostname> [--domain <api-url>]
rs-tunnel logout [--domain <api-url>]
rs-tunnel doctor [--domain <api-url>]
```

## Configuration

- `RS_TUNNEL_API_URL`: preferred API base URL override.
- `RS_TUNNEL_API_BASE_URL`: legacy alias (still supported).
- `--domain`: command-level API override; also persists for future commands.

## Notes

- This package is only the CLI. The API must be running separately.
- Cloudflare credentials stay on the API side; the CLI only receives short-lived tunnel tokens.

## Troubleshooting

- Run `rs-tunnel doctor` to verify API reachability and local setup.
- Run `rs-tunnel up --verbose` to include raw `cloudflared` lines.

## Repository

- Monorepo: https://github.com/RipeSeed/rs-tunnel
- Full project docs: https://github.com/RipeSeed/rs-tunnel/blob/main/README.md

