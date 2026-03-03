import { describe, expect, it } from 'vitest';

import { tunnelListResponseSchema, tunnelTelemetryIngestRequestSchema } from '../src/contracts.ts';

describe('shared contracts', () => {
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
});
