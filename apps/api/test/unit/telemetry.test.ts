import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { AppError } from '../../src/lib/app-error.js';
import { TelemetryService } from '../../src/services/telemetry.service.js';
import type { Repository } from '../../src/db/repository.js';

describe('TelemetryService', () => {
  const repository = {
    getTunnelById: vi.fn(),
    findTunnelForUserAnyStatus: vi.fn(),
    upsertLiveTelemetry: vi.fn(),
    insertMetricsPoint: vi.fn(),
    insertRequestLogs: vi.fn(),
    pruneTelemetry: vi.fn(),
    listLiveTelemetryForUser: vi.fn(),
    listMetrics: vi.fn(),
    listRequests: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repository.pruneTelemetry.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when tunnel is not active during runtime ingest', async () => {
    repository.getTunnelById.mockResolvedValue({
      id: 'tunnel-uuid',
      status: 'stopping',
    });

    const service = new TelemetryService(repository as unknown as Repository);

    await expect(
      service.ingestRuntimeTelemetry({
        tunnelId: 'tunnel-1',
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
        requests: [],
      }),
    ).rejects.toThrowError(AppError);
  });

  it('sanitizes request path and strips query string', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    repository.getTunnelById.mockResolvedValue({
      id: 'tunnel-uuid',
      userId: 'user-1',
      status: 'active',
    });

    const service = new TelemetryService(repository as unknown as Repository);

    await service.ingestRuntimeTelemetry({
      tunnelId: 'tunnel-uuid',
      region: 'iad',
      metrics: {
        ttl: 1,
        opn: 1,
        rt1Ms: 10,
        rt5Ms: 10,
        p50Ms: 10,
        p90Ms: 10,
        requests: 1,
        errors: 0,
        bytes: 5,
      },
      requests: [
        {
          startedAtEpochMs: Date.now(),
          method: 'GET',
          path: '/foo/bar?token=secret',
          statusCode: 200,
          durationMs: 12.3,
          responseBytes: 5,
          error: false,
          protocol: 'http',
        },
      ],
    });

    expect(repository.insertRequestLogs).toHaveBeenCalledTimes(1);
    const args = (repository.insertRequestLogs as ReturnType<typeof vi.fn>).mock.calls[0];
    const requests = args?.[2] as Array<{ path: string }>;
    expect(requests[0]?.path).toBe('/foo/bar');
  });

  it('downsamples metrics points to at most once per 10 seconds per tunnel', async () => {
    vi.useFakeTimers();
    repository.getTunnelById.mockResolvedValue({
      id: 'tunnel-uuid',
      userId: 'user-1',
      status: 'active',
    });

    const service = new TelemetryService(repository as unknown as Repository);

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    await service.ingestRuntimeTelemetry({
      tunnelId: 'tunnel-uuid',
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
      requests: [],
    });

    vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'));
    await service.ingestRuntimeTelemetry({
      tunnelId: 'tunnel-uuid',
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
      requests: [],
    });

    vi.setSystemTime(new Date('2026-01-01T00:00:11.000Z'));
    await service.ingestRuntimeTelemetry({
      tunnelId: 'tunnel-uuid',
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
      requests: [],
    });

    expect(repository.insertMetricsPoint).toHaveBeenCalledTimes(2);
  });
});
