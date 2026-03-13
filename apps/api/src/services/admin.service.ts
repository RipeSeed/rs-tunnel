import type {
  AdminActivityEvent,
  AdminDashboard,
  AdminSession,
  AdminTunnelDetailResponse,
  AdminTunnelSummary,
  AdminUserSummary,
  TunnelMetricsPoint,
  TunnelRequestLog,
  TunnelStatus,
} from '@ripeseed/shared';

import { AppError } from '../lib/app-error.js';
import { Repository } from '../db/repository.js';
import type { AdminService as AdminServiceContract } from '../types.js';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HOUR_IN_MS = 60 * 60 * 1000;
const DASHBOARD_TUNNELS_LIMIT = 8;
const DASHBOARD_USERS_LIMIT = 8;
const DASHBOARD_ACTIVITY_LIMIT = 12;
const STATUS_ORDER: TunnelStatus[] = ['creating', 'active', 'stopping', 'stopped', 'failed'];

type DateLike = Date | string;

function toIsoString(value: DateLike | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Invalid date-like value: ${value}`);
  }

  return parsed.toISOString();
}

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 10_000) / 100;
}

function normalizeBucketStart(value: DateLike): string {
  const bucket = new Date(value);
  bucket.setMinutes(0, 0, 0);
  return bucket.toISOString();
}

function buildHourlySeries<T extends object>(
  rows: Array<T & { bucketStart: DateLike }>,
  makeEmpty: (bucketStart: string) => Omit<T, 'bucketStart'> & { bucketStart: string },
): Array<Omit<T, 'bucketStart'> & { bucketStart: string }> {
  const now = new Date();
  now.setMinutes(0, 0, 0);

  const series = new Map<string, Omit<T, 'bucketStart'> & { bucketStart: string }>();
  for (const row of rows) {
    const normalizedBucketStart = normalizeBucketStart(row.bucketStart);
    series.set(normalizedBucketStart, {
      ...(row as Omit<T, 'bucketStart'>),
      bucketStart: normalizedBucketStart,
    });
  }

  const output: Array<Omit<T, 'bucketStart'> & { bucketStart: string }> = [];
  for (let offset = 23; offset >= 0; offset -= 1) {
    const bucketStart = new Date(now.getTime() - offset * HOUR_IN_MS).toISOString();
    output.push(series.get(bucketStart) ?? makeEmpty(bucketStart));
  }

  return output;
}

export class AdminService implements AdminServiceContract {
  constructor(private readonly repository: Repository) {}

  async getBootstrapStatus() {
    const ownerExists = await this.repository.hasOwnerUser();
    return {
      ownerExists,
      firstLoginClaimsOwner: !ownerExists,
    };
  }

  async getSession(userId: string): Promise<AdminSession> {
    const owner = await this.requireOwner(userId);

    return {
      user: {
        id: owner.id,
        email: owner.email,
        slackUserId: owner.slackUserId,
        slackTeamId: owner.slackTeamId,
        role: owner.adminRole as AdminSession['user']['role'],
        roleGrantedAt: toIsoString(owner.roleGrantedAt),
      },
    };
  }

  async getDashboard(userId: string): Promise<AdminDashboard> {
    await this.requireOwner(userId);

    const since = new Date(Date.now() - DAY_IN_MS);
    const [
      totalUsers,
      activeTunnels,
      liveOpenConnections,
      trafficSummary,
      pendingCleanupJobs,
      statusCounts,
      requestVolumeRows,
      bandwidthRows,
      liveTunnels,
      users,
      activity,
    ] = await Promise.all([
      this.repository.countUsers(),
      this.repository.countOrgActiveTunnels(),
      this.repository.getOrgLiveOpenConnections(),
      this.repository.getOrgTrafficSummary(since),
      this.repository.countPendingCleanupJobs(),
      this.repository.listOrgTunnelStatusCounts(),
      this.repository.listOrgRequestVolumeByHour(since),
      this.repository.listOrgBandwidthByHour(since),
      this.repository.listAdminTunnels(DASHBOARD_TUNNELS_LIMIT),
      this.repository.listAdminUsers(DASHBOARD_USERS_LIMIT),
      this.repository.listRecentActivity(DASHBOARD_ACTIVITY_LIMIT),
    ]);

    const statusBreakdownMap = new Map(statusCounts.map((item) => [item.status, item.count]));

    return {
      summary: {
        totalUsers,
        activeTunnels,
        liveOpenConnections,
        requestsLast24h: trafficSummary.requests,
        errorRateLast24h: toPercent(trafficSummary.errors, trafficSummary.requests),
        bytesLast24h: trafficSummary.bytes,
        pendingCleanupJobs,
      },
      tunnelStatusBreakdown: STATUS_ORDER.map((status) => ({
        status,
        count: statusBreakdownMap.get(status) ?? 0,
      })),
      requestVolume24h: buildHourlySeries(requestVolumeRows, (bucketStart) => ({
        bucketStart,
        requests: 0,
        errors: 0,
      })),
      bandwidth24h: buildHourlySeries(bandwidthRows, (bucketStart) => ({
        bucketStart,
        bytes: 0,
      })),
      liveTunnels: liveTunnels.map((row) => this.mapAdminTunnel(row)),
      users: users.map((row) => this.mapAdminUser(row)),
      recentActivity: activity.map((row) => this.mapActivity(row.audit, row.userEmail)),
    };
  }

  async listUsers(userId: string): Promise<AdminUserSummary[]> {
    await this.requireOwner(userId);
    const users = await this.repository.listAdminUsers();
    return users.map((row) => this.mapAdminUser(row));
  }

  async listTunnels(userId: string): Promise<AdminTunnelSummary[]> {
    await this.requireOwner(userId);
    const tunnels = await this.repository.listAdminTunnels();
    return tunnels.map((row) => this.mapAdminTunnel(row));
  }

  async getTunnelDetail(input: { userId: string; tunnelId: string }): Promise<AdminTunnelDetailResponse> {
    await this.requireOwner(input.userId);

    const tunnel = await this.repository.getAdminTunnelById(input.tunnelId);
    if (!tunnel) {
      throw new AppError(404, 'TUNNEL_NOT_FOUND', 'Tunnel was not found.');
    }

    const summary = await this.repository.getTunnelTrafficSummary(input.tunnelId, new Date(Date.now() - DAY_IN_MS));

    return {
      tunnel: this.mapAdminTunnel(tunnel),
      last24h: {
        requests: summary.requests,
        errorRate: toPercent(summary.errors, summary.requests),
        bytes: summary.bytes,
        averageDurationMs: summary.averageDurationMs,
      },
    };
  }

  async getTunnelMetrics(input: {
    userId: string;
    tunnelId: string;
    from: Date;
    to: Date;
    limit: number;
  }): Promise<TunnelMetricsPoint[]> {
    await this.requireOwner(input.userId);

    const tunnel = await this.repository.getAdminTunnelById(input.tunnelId);
    if (!tunnel) {
      throw new AppError(404, 'TUNNEL_NOT_FOUND', 'Tunnel was not found.');
    }

    const points = await this.repository.listMetrics(input.tunnelId, input.from, input.to, input.limit);

    return points.map((point) => ({
      capturedAt: toIsoString(point.capturedAt)!,
      ttl: point.ttl,
      opn: point.opn,
      rt1Ms: point.rt1Ms ?? null,
      p90Ms: point.p90Ms ?? null,
      requests: point.requests,
      errors: point.errors,
      bytes: point.bytes,
    }));
  }

  async getTunnelRequests(input: {
    userId: string;
    tunnelId: string;
    after: Date | null;
    limit: number;
  }): Promise<TunnelRequestLog[]> {
    await this.requireOwner(input.userId);

    const tunnel = await this.repository.getAdminTunnelById(input.tunnelId);
    if (!tunnel) {
      throw new AppError(404, 'TUNNEL_NOT_FOUND', 'Tunnel was not found.');
    }

    const rows = await this.repository.listRequests(input.tunnelId, input.after, input.limit);

    return rows.map((row) => ({
      ingestedAt: toIsoString(row.ingestedAt)!,
      startedAt: toIsoString(row.startedAt)!,
      method: row.method,
      path: row.path,
      statusCode: row.statusCode,
      durationMs: row.durationMs,
      responseBytes: row.responseBytes ?? null,
      error: row.error,
      protocol: row.protocol === 'ws' ? 'ws' : 'http',
    }));
  }

  async listActivity(input: { userId: string; limit: number }): Promise<AdminActivityEvent[]> {
    await this.requireOwner(input.userId);
    const rows = await this.repository.listRecentActivity(input.limit);
    return rows.map((row) => this.mapActivity(row.audit, row.userEmail));
  }

  private async requireOwner(userId: string) {
    const user = await this.repository.getUserById(userId);
    if (!user) {
      throw new AppError(401, 'INVALID_TOKEN', 'User session is invalid.');
    }

    if (user.adminRole !== 'owner') {
      throw new AppError(403, 'OWNER_ACCESS_REQUIRED', 'Only the instance owner can access the admin panel.');
    }

    return user;
  }

  private mapAdminUser(row: {
      user: {
        id: string;
        email: string;
        slackUserId: string;
        slackTeamId: string;
        adminRole: string;
        roleGrantedAt: DateLike | null;
        createdAt: DateLike;
        updatedAt: DateLike;
      };
      activeTunnelCount: number;
      totalTunnelCount: number;
      lastAuditAt: DateLike | null;
    }): AdminUserSummary {
    return {
      id: row.user.id,
      email: row.user.email,
      slackUserId: row.user.slackUserId,
      slackTeamId: row.user.slackTeamId,
      role: row.user.adminRole as AdminUserSummary['role'],
      roleGrantedAt: toIsoString(row.user.roleGrantedAt),
      createdAt: toIsoString(row.user.createdAt)!,
      updatedAt: toIsoString(row.user.updatedAt)!,
      activeTunnelCount: row.activeTunnelCount,
      totalTunnelCount: row.totalTunnelCount,
      lastAuditAt: toIsoString(row.lastAuditAt),
    };
  }

  private mapAdminTunnel(row: {
    id: string;
    userId: string;
    userEmail: string;
      hostname: string;
      slug: string;
      status: string;
      requestedPort: number;
      createdAt: DateLike;
      stoppedAt: DateLike | null;
      lastError: string | null;
      receivedAt: DateLike | null;
      region: string | null;
      ttl: number | null;
      opn: number;
      rt1Ms: number | null;
      p90Ms: number | null;
      requests: number;
      errors: number;
      bytes: number;
      lastHeartbeatAt: DateLike | null;
      expiresAt: DateLike | null;
    }): AdminTunnelSummary {
    return {
      id: row.id,
      userId: row.userId,
      userEmail: row.userEmail,
      hostname: row.hostname,
      slug: row.slug,
      status: row.status as AdminTunnelSummary['status'],
      requestedPort: row.requestedPort,
      createdAt: toIsoString(row.createdAt)!,
      stoppedAt: toIsoString(row.stoppedAt),
      lastError: row.lastError,
      live: {
        receivedAt: toIsoString(row.receivedAt),
        region: row.region ?? null,
        ttl: row.ttl ?? null,
        opn: row.opn,
        rt1Ms: row.rt1Ms ?? null,
        p90Ms: row.p90Ms ?? null,
        requests: row.requests,
        errors: row.errors,
        bytes: row.bytes,
        lastHeartbeatAt: toIsoString(row.lastHeartbeatAt),
        expiresAt: toIsoString(row.expiresAt),
      },
    };
  }

  private mapActivity(
    audit: {
      id: string;
      createdAt: DateLike;
      action: string;
      userId: string | null;
      metadata: Record<string, unknown> | null;
    },
    userEmail: string | null,
  ): AdminActivityEvent {
    return {
      id: audit.id,
      createdAt: toIsoString(audit.createdAt)!,
      action: audit.action,
      userId: audit.userId,
      userEmail,
      metadata: audit.metadata ?? null,
    };
  }
}
