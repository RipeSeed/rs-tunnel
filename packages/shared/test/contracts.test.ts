import { describe, expect, it } from 'vitest';

import {
  adminDashboardSchema,
  adminSessionSchema,
  adminUsersListResponseSchema,
  adminWebAuthExchangeRequestSchema,
  adminBootstrapStatusSchema,
  authStartRequestSchema,
  authStatusResponseSchema,
  tunnelCreateResponseSchema,
  tunnelListResponseSchema,
  tunnelTelemetryIngestRequestSchema,
} from '../src/contracts.ts';

describe('shared contracts', () => {
  it('accepts tunnel creation responses with runtime auth fields', () => {
    const parsed = tunnelCreateResponseSchema.parse({
      tunnelId: '11111111-1111-1111-1111-111111111111',
      hostname: 'demo.tunnel.example.com',
      cloudflaredToken: 'cf-token',
      tunnelRunToken: 'run-token',
      heartbeatIntervalSec: 20,
      leaseTimeoutSec: 60,
    });

    expect(parsed.tunnelRunToken).toBe('run-token');
    expect(parsed.heartbeatIntervalSec).toBe(20);
    expect(parsed.leaseTimeoutSec).toBe(60);
  });

  it('accepts tunnel list entries with lease null or object', () => {
    const parsed = tunnelListResponseSchema.parse([
      {
        id: '11111111-1111-1111-1111-111111111111',
        hostname: 'demo.tunnel.example.com',
        slug: 'demo',
        status: 'active',
        requestedPort: 3000,
        createdAt: '2026-01-01T00:00:00.000Z',
        lease: null,
        stoppedAt: null,
        lastError: null,
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        hostname: 'demo2.tunnel.example.com',
        slug: 'demo2',
        status: 'stopping',
        requestedPort: 3000,
        createdAt: '2026-01-01T00:00:00.000Z',
        lease: {
          lastHeartbeatAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-01-01T00:01:00.000Z',
        },
        stoppedAt: null,
        lastError: null,
      },
    ]);

    expect(parsed.length).toBe(2);
    expect(parsed[0]?.lease).toBeNull();
    expect(parsed[1]?.lease).toMatchObject({ expiresAt: '2026-01-01T00:01:00.000Z' });
  });

  it('rejects telemetry payloads with more than 200 requests', () => {
    const base = {
      region: null,
      metrics: {
        ttl: 0,
        opn: 0,
        rt1Ms: null,
        rt5Ms: null,
        p50Ms: null,
        p90Ms: null,
        requests: 0,
        errors: 0,
        bytes: 0,
      },
      requests: Array.from({ length: 201 }, () => ({
        startedAtEpochMs: 0,
        method: 'GET',
        path: '/',
        statusCode: 200,
        durationMs: 1,
        responseBytes: 0,
        error: false,
        protocol: 'http' as const,
      })),
    };

    expect(() => tunnelTelemetryIngestRequestSchema.parse(base)).toThrow();
  });

  it('accepts auth start requests without a localhost callback URL', () => {
    const parsed = authStartRequestSchema.parse({
      email: 'osama@example.com',
      codeChallenge: '12345678901234567890',
    });

    expect(parsed.email).toBe('osama@example.com');
  });

  it('accepts auth status responses for remote login completion', () => {
    const parsed = authStatusResponseSchema.parse({
      status: 'authorized',
      loginCode: 'login-code-12345',
    });

    expect(parsed.status).toBe('authorized');
    expect(parsed.loginCode).toBe('login-code-12345');
  });

  it('accepts admin bootstrap status responses', () => {
    const parsed = adminBootstrapStatusSchema.parse({
      ownerExists: false,
      firstLoginClaimsOwner: true,
    });

    expect(parsed.firstLoginClaimsOwner).toBe(true);
  });

  it('accepts admin auth exchange requests without PKCE', () => {
    const parsed = adminWebAuthExchangeRequestSchema.parse({
      loginCode: 'admin-login-code-12345',
    });

    expect(parsed.loginCode).toBe('admin-login-code-12345');
  });

  it('accepts admin sessions with owner metadata', () => {
    const parsed = adminSessionSchema.parse({
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'owner@example.com',
        slackUserId: 'U1',
        slackTeamId: 'T1',
        role: 'owner',
        roleGrantedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(parsed.user.role).toBe('owner');
  });

  it('accepts admin user list responses', () => {
    const parsed = adminUsersListResponseSchema.parse([
      {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'owner@example.com',
        slackUserId: 'U1',
        slackTeamId: 'T1',
        role: 'owner',
        roleGrantedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        activeTunnelCount: 1,
        totalTunnelCount: 2,
        lastAuditAt: '2026-01-01T01:00:00.000Z',
      },
    ]);

    expect(parsed[0]?.activeTunnelCount).toBe(1);
  });

  it('accepts admin dashboard payloads', () => {
    const parsed = adminDashboardSchema.parse({
      summary: {
        totalUsers: 2,
        activeTunnels: 1,
        liveOpenConnections: 3,
        requestsLast24h: 100,
        errorRateLast24h: 2.5,
        bytesLast24h: 1024,
        pendingCleanupJobs: 0,
      },
      tunnelStatusBreakdown: [
        { status: 'active', count: 1 },
        { status: 'stopped', count: 4 },
      ],
      requestVolume24h: [
        {
          bucketStart: '2026-01-01T00:00:00.000Z',
          requests: 10,
          errors: 1,
        },
      ],
      bandwidth24h: [
        {
          bucketStart: '2026-01-01T00:00:00.000Z',
          bytes: 512,
        },
      ],
      liveTunnels: [],
      users: [],
      recentActivity: [],
    });

    expect(parsed.summary.liveOpenConnections).toBe(3);
  });
});
