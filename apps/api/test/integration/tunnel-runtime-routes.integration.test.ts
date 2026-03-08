import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/app.js';
import { AppError } from '../../src/lib/app-error.js';
import type { BuildAppInput } from '../../src/app.js';

const env: BuildAppInput['env'] = {
  NODE_ENV: 'test',
  PORT: 8080,
  API_BASE_URL: 'http://localhost:8080',
  DATABASE_URL: 'postgres://x',
  JWT_SECRET: '1234567890123456',
  REFRESH_TOKEN_SECRET: '1234567890123456',
  JWT_ACCESS_TTL_MINUTES: 15,
  REFRESH_TTL_DAYS: 30,
  SLACK_CLIENT_ID: 'x',
  SLACK_CLIENT_SECRET: 'x',
  SLACK_REDIRECT_URI: 'http://localhost:8080/v1/auth/slack/callback',
  ALLOWED_EMAIL_DOMAIN: '@example.com',
  ALLOWED_SLACK_TEAM_ID: 'T1',
  CLOUDFLARE_ACCOUNT_ID: 'A1',
  CLOUDFLARE_ZONE_ID: 'Z1',
  CLOUDFLARE_API_TOKEN: 'token',
  CLOUDFLARE_BASE_DOMAIN: 'tunnel.example.com',
  MAX_ACTIVE_TUNNELS: 5,
  HEARTBEAT_INTERVAL_SEC: 20,
  LEASE_TIMEOUT_SEC: 60,
  REAPER_INTERVAL_SEC: 30,
};

describe('runtime tunnel routes', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function buildTestApp() {
    const tunnelService = {
      createTunnel: vi.fn(),
      listTunnels: vi.fn(),
      heartbeatTunnel: vi.fn(async () => ({ expiresAt: '2026-01-01T00:01:00.000Z' })),
      stopTunnel: vi.fn(),
      stopTunnelById: vi.fn(),
    };

    const telemetryService = {
      ingestRuntimeTelemetry: vi.fn(async () => {}),
      getLiveTelemetry: vi.fn(),
      getMetricsHistory: vi.fn(),
      getRequestLogs: vi.fn(),
    };

    const tokenService = {
      signAccessToken: vi.fn(),
      verifyAccessToken: vi.fn(),
      signTunnelRunToken: vi.fn(),
      verifyTunnelRunToken: vi.fn((token: string) => {
        if (token === 'runtime-token') {
          return { scope: 'tunnel:runtime' as const, tunnelId: 'tunnel-1' };
        }

        throw new AppError(401, 'INVALID_TOKEN', 'Invalid tunnel runtime token.');
      }),
      generateRefreshToken: vi.fn(),
      hashToken: vi.fn(),
    };

    const authService = {
      startSlackAuth: vi.fn(),
      handleSlackCallback: vi.fn(),
      exchangeLoginCode: vi.fn(),
      refreshTokens: vi.fn(),
      logout: vi.fn(),
    };

    const app = buildApp({
      env,
      services: {
        authService: authService as never,
        telemetryService: telemetryService as never,
        tunnelService: tunnelService as never,
        tokenService: tokenService as never,
      },
    });

    return { app, tunnelService, telemetryService };
  }

  it('accepts runtime heartbeat with matching runtime token', async () => {
    const { app, tunnelService } = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/tunnels/tunnel-1/heartbeat',
      headers: {
        authorization: 'Bearer runtime-token',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, expiresAt: '2026-01-01T00:01:00.000Z' });
    expect(tunnelService.heartbeatTunnel).toHaveBeenCalledWith({ tunnelId: 'tunnel-1' });

    await app.close();
  });

  it('rejects runtime telemetry when the token tunnel does not match the route', async () => {
    const { app, telemetryService } = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/tunnels/tunnel-2/telemetry',
      headers: {
        authorization: 'Bearer runtime-token',
      },
      payload: {
        region: 'iad',
        metrics: {
          ttl: 1,
          opn: 1,
          rt1Ms: 1,
          rt5Ms: 1,
          p50Ms: 1,
          p90Ms: 1,
          requests: 1,
          errors: 0,
          bytes: 1,
        },
        requests: [],
      },
    });

    expect(response.statusCode).toBe(403);
    expect(telemetryService.ingestRuntimeTelemetry).not.toHaveBeenCalled();

    await app.close();
  });
});