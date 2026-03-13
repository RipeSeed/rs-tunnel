import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/app.js';
import { AppError } from '../../src/lib/app-error.js';
import type { BuildAppInput } from '../../src/app.js';

const env: BuildAppInput['env'] = {
  NODE_ENV: 'test',
  PORT: 8080,
  API_BASE_URL: 'http://localhost:8080',
  ADMIN_WEB_BASE_URL: 'http://localhost:3001',
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

describe('admin routes', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function buildTestApp() {
    const adminService = {
      getBootstrapStatus: vi.fn(async () => ({ ownerExists: true, firstLoginClaimsOwner: false })),
      getSession: vi.fn(async () => ({
        user: {
          id: 'owner-1',
          email: 'owner@example.com',
          slackUserId: 'U1',
          slackTeamId: 'T1',
          role: 'owner' as const,
          roleGrantedAt: '2026-01-01T00:00:00.000Z',
        },
      })),
      getDashboard: vi.fn(),
      listUsers: vi.fn(),
      listTunnels: vi.fn(),
      getTunnelDetail: vi.fn(),
      getTunnelMetrics: vi.fn(),
      getTunnelRequests: vi.fn(),
      listActivity: vi.fn(),
    };

    const authService = {
      startSlackAuth: vi.fn(),
      startAdminWebSlackAuth: vi.fn(),
      handleSlackCallback: vi.fn(),
      getSlackAuthStatus: vi.fn(),
      exchangeLoginCode: vi.fn(),
      exchangeAdminWebLoginCode: vi.fn(),
      refreshTokens: vi.fn(),
      logout: vi.fn(),
    };

    const tunnelService = {
      createTunnel: vi.fn(),
      listTunnels: vi.fn(),
      heartbeatTunnel: vi.fn(),
      stopTunnel: vi.fn(),
      stopTunnelById: vi.fn(),
    };

    const telemetryService = {
      ingestRuntimeTelemetry: vi.fn(),
      getLiveTelemetry: vi.fn(),
      getMetricsHistory: vi.fn(),
      getRequestLogs: vi.fn(),
    };

    const tokenService = {
      signAccessToken: vi.fn(),
      verifyAccessToken: vi.fn(() => ({
        sub: 'owner-1',
        email: 'owner@example.com',
        slackUserId: 'U1',
        slackTeamId: 'T1',
      })),
      signTunnelRunToken: vi.fn(),
      verifyTunnelRunToken: vi.fn(),
      generateRefreshToken: vi.fn(),
      hashToken: vi.fn(),
    };

    const app = buildApp({
      env,
      services: {
        adminService: adminService as never,
        authService: authService as never,
        telemetryService: telemetryService as never,
        tunnelService: tunnelService as never,
        tokenService: tokenService as never,
      },
    });

    return { app, adminService };
  }

  it('returns owner-only access errors from admin endpoints', async () => {
    const { app, adminService } = buildTestApp();
    adminService.getDashboard.mockRejectedValue(
      new AppError(403, 'OWNER_ACCESS_REQUIRED', 'Only the instance owner can access the admin panel.'),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/dashboard',
      headers: {
        authorization: 'Bearer owner-token',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'OWNER_ACCESS_REQUIRED' });

    await app.close();
  });

  it('lets the owner fetch tunnel detail regardless of the tunnel owner', async () => {
    const { app, adminService } = buildTestApp();
    adminService.getTunnelDetail.mockResolvedValue({
      tunnel: {
        id: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
        userEmail: 'member@example.com',
        hostname: 'demo.tunnel.example.com',
        slug: 'demo',
        status: 'active',
        requestedPort: 3000,
        createdAt: '2026-01-01T00:00:00.000Z',
        stoppedAt: null,
        lastError: null,
        live: {
          receivedAt: '2026-01-01T00:10:00.000Z',
          region: 'IAD',
          ttl: 12,
          opn: 4,
          rt1Ms: 12,
          p90Ms: 34,
          requests: 100,
          errors: 2,
          bytes: 1000,
          lastHeartbeatAt: '2026-01-01T00:10:00.000Z',
          expiresAt: '2026-01-01T00:11:00.000Z',
        },
      },
      last24h: {
        requests: 100,
        errorRate: 2,
        bytes: 1000,
        averageDurationMs: 12,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/tunnels/22222222-2222-4222-8222-222222222222',
      headers: {
        authorization: 'Bearer owner-token',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(adminService.getTunnelDetail).toHaveBeenCalledWith({
      userId: 'owner-1',
      tunnelId: '22222222-2222-4222-8222-222222222222',
    });
    expect(response.json()).toMatchObject({
      tunnel: {
        id: '22222222-2222-4222-8222-222222222222',
        userEmail: 'member@example.com',
      },
    });

    await app.close();
  });
});
