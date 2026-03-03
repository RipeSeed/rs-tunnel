import { logger } from '../lib/logger.js';
import { AppError } from '../lib/app-error.js';
import { Repository } from '../db/repository.js';
import type {
  TelemetryService as TelemetryServiceContract,
  TunnelLiveTelemetry,
  TunnelMetricsPoint,
  TunnelRequestLog,
  TunnelTelemetryMetrics,
  TunnelTelemetryRequestEvent,
} from '../types.js';

const METRICS_DOWNSAMPLE_MS = 10_000;
const PRUNE_INTERVAL_MS = 10 * 60 * 1000;
const REQUEST_RETENTION_MS = 24 * 60 * 60 * 1000;
const METRICS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeRegion(region?: string | null): string | null {
  const trimmed = region?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 16).toUpperCase();
}

function sanitizePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  const base = trimmed.split('?')[0]?.split('#')[0] ?? '';
  const normalized = base.length === 0 ? '/' : base.startsWith('/') ? base : `/${base}`;
  return normalized.slice(0, 512);
}

function toNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function toNullableRoundedInt(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.round(value));
}

function normalizeMetrics(metrics: TunnelTelemetryMetrics): {
  ttl: number;
  opn: number;
  rt1Ms: number | null;
  rt5Ms: number | null;
  p50Ms: number | null;
  p90Ms: number | null;
  requests: number;
  errors: number;
  bytes: number;
} {
  return {
    ttl: toNonNegativeInt(metrics.ttl),
    opn: toNonNegativeInt(metrics.opn),
    rt1Ms: toNullableRoundedInt(metrics.rt1Ms),
    rt5Ms: toNullableRoundedInt(metrics.rt5Ms),
    p50Ms: toNullableRoundedInt(metrics.p50Ms),
    p90Ms: toNullableRoundedInt(metrics.p90Ms),
    requests: toNonNegativeInt(metrics.requests),
    errors: toNonNegativeInt(metrics.errors),
    bytes: toNonNegativeInt(metrics.bytes),
  };
}

function normalizeRequestEvent(event: TunnelTelemetryRequestEvent): TunnelTelemetryRequestEvent {
  return {
    startedAtEpochMs: toNonNegativeInt(event.startedAtEpochMs),
    method: event.method.trim().slice(0, 16).toUpperCase(),
    path: sanitizePath(event.path),
    statusCode: Math.min(599, Math.max(100, toNonNegativeInt(event.statusCode))),
    durationMs: Math.max(0, event.durationMs),
    responseBytes: event.responseBytes === null ? null : toNonNegativeInt(event.responseBytes),
    error: Boolean(event.error),
    protocol: event.protocol === 'ws' ? 'ws' : 'http',
  };
}

export class TelemetryService implements TelemetryServiceContract {
  private lastPrunedAtMs = 0;
  private readonly lastMetricsPointAtMs = new Map<string, number>();

  constructor(private readonly repository: Repository) {}

  async ingestTelemetry(input: {
    userId: string;
    tunnelIdentifier: string;
    region?: string | null;
    metrics: TunnelTelemetryMetrics;
    requests: TunnelTelemetryRequestEvent[];
  }): Promise<void> {
    const tunnel = await this.repository.findTunnelForUser(input.userId, input.tunnelIdentifier);
    if (!tunnel) {
      throw new AppError(404, 'TUNNEL_NOT_FOUND', 'Tunnel was not found for this user.');
    }

    const now = new Date();
    const nowMs = now.getTime();
    const region = normalizeRegion(input.region);
    const metrics = normalizeMetrics(input.metrics);

    await this.repository.upsertLiveTelemetry({
      tunnelId: tunnel.id,
      receivedAt: now,
      region,
      ...metrics,
    });

    const lastPointAtMs = this.lastMetricsPointAtMs.get(tunnel.id) ?? 0;
    if (nowMs - lastPointAtMs >= METRICS_DOWNSAMPLE_MS) {
      await this.repository.insertMetricsPoint({
        tunnelId: tunnel.id,
        capturedAt: now,
        ...metrics,
      });
      this.lastMetricsPointAtMs.set(tunnel.id, nowMs);
    }

    const normalizedRequests = input.requests.map(normalizeRequestEvent);
    await this.repository.insertRequestLogs(
      tunnel.id,
      now,
      normalizedRequests.map((event) => ({
        startedAt: new Date(event.startedAtEpochMs),
        method: event.method,
        path: event.path,
        statusCode: event.statusCode,
        durationMs: Math.max(0, Math.round(event.durationMs)),
        responseBytes: event.responseBytes,
        error: event.error,
        protocol: event.protocol,
      })),
    );

    if (nowMs - this.lastPrunedAtMs >= PRUNE_INTERVAL_MS) {
      this.lastPrunedAtMs = nowMs;
      const requestsOlderThan = new Date(nowMs - REQUEST_RETENTION_MS);
      const metricsOlderThan = new Date(nowMs - METRICS_RETENTION_MS);

      void this.repository.pruneTelemetry({ metricsOlderThan, requestsOlderThan }).catch((error) => {
        logger.error('Telemetry prune failed', error);
      });
    }
  }

  async getLiveTelemetry(userId: string): Promise<TunnelLiveTelemetry[]> {
    const rows = await this.repository.listLiveTelemetryForUser(userId);

    return rows.map((row) => ({
      tunnelId: row.tunnelId,
      receivedAt: row.receivedAt.toISOString(),
      region: row.region ?? null,
      metrics: {
        ttl: row.ttl,
        opn: row.opn,
        rt1Ms: row.rt1Ms ?? null,
        rt5Ms: row.rt5Ms ?? null,
        p50Ms: row.p50Ms ?? null,
        p90Ms: row.p90Ms ?? null,
        requests: row.requests,
        errors: row.errors,
        bytes: row.bytes,
      },
    }));
  }

  async getMetricsHistory(input: {
    userId: string;
    tunnelId: string;
    from: Date;
    to: Date;
    limit: number;
  }): Promise<TunnelMetricsPoint[]> {
    const tunnel = await this.repository.findTunnelForUserAnyStatus(input.userId, input.tunnelId);
    if (!tunnel) {
      throw new AppError(404, 'TUNNEL_NOT_FOUND', 'Tunnel was not found for this user.');
    }

    const points = await this.repository.listMetrics(tunnel.id, input.from, input.to, input.limit);
    return points.map((point) => ({
      capturedAt: point.capturedAt.toISOString(),
      ttl: point.ttl,
      opn: point.opn,
      rt1Ms: point.rt1Ms ?? null,
      p90Ms: point.p90Ms ?? null,
      requests: point.requests,
      errors: point.errors,
      bytes: point.bytes,
    }));
  }

  async getRequestLogs(input: {
    userId: string;
    tunnelId: string;
    after: Date | null;
    limit: number;
  }): Promise<TunnelRequestLog[]> {
    const tunnel = await this.repository.findTunnelForUserAnyStatus(input.userId, input.tunnelId);
    if (!tunnel) {
      throw new AppError(404, 'TUNNEL_NOT_FOUND', 'Tunnel was not found for this user.');
    }

    const rows = await this.repository.listRequests(tunnel.id, input.after, input.limit);
    return rows.map((row) => ({
      ingestedAt: row.ingestedAt.toISOString(),
      startedAt: row.startedAt.toISOString(),
      method: row.method,
      path: row.path,
      statusCode: row.statusCode,
      durationMs: row.durationMs,
      responseBytes: row.responseBytes ?? null,
      error: row.error,
      protocol: row.protocol === 'ws' ? 'ws' : 'http',
    }));
  }
}

