import { and, asc, eq, gt, gte, inArray, isNull, lte, sql } from 'drizzle-orm';

import { db } from './client.js';
import {
  auditLogs,
  cleanupJobs,
  oauthSessions,
  refreshTokens,
  touchUpdatedAtSql,
  tunnelLiveMetrics,
  tunnelMetrics,
  tunnelLeases,
  tunnelRequests,
  tunnels,
  users,
  type DbCleanupJob,
  type DbOAuthSession,
  type DbTunnelLease,
  type DbTunnelLiveMetric,
  type DbTunnelMetric,
  type DbTunnelRequest,
  type DbTunnel,
  type DbUser,
} from './schema.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidLike(value: string): boolean {
  return uuidPattern.test(value);
}

export class Repository {
  async upsertUserBySlack(input: {
    email: string;
    slackUserId: string;
    slackTeamId: string;
  }): Promise<DbUser> {
    const [user] = await db
      .insert(users)
      .values({
        email: input.email,
        slackUserId: input.slackUserId,
        slackTeamId: input.slackTeamId,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          slackUserId: input.slackUserId,
          slackTeamId: input.slackTeamId,
          updatedAt: touchUpdatedAtSql,
        },
      })
      .returning();

    if (!user) {
      throw new Error('Failed to upsert user.');
    }

    return user;
  }

  async getUserById(userId: string): Promise<DbUser | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  async createOauthSession(input: {
    email: string;
    state: string;
    codeChallenge: string;
    cliCallbackUrl: string;
    expiresAt: Date;
  }): Promise<DbOAuthSession> {
    const [session] = await db
      .insert(oauthSessions)
      .values({
        email: input.email,
        state: input.state,
        codeChallenge: input.codeChallenge,
        cliCallbackUrl: input.cliCallbackUrl,
        expiresAt: input.expiresAt,
      })
      .returning();

    if (!session) {
      throw new Error('Failed to create oauth session.');
    }

    return session;
  }

  async getOauthSessionByState(state: string): Promise<DbOAuthSession | undefined> {
    const [session] = await db.select().from(oauthSessions).where(eq(oauthSessions.state, state));
    return session;
  }

  async getOauthSessionByLoginCode(loginCode: string): Promise<DbOAuthSession | undefined> {
    const [session] = await db
      .select()
      .from(oauthSessions)
      .where(eq(oauthSessions.loginCode, loginCode));
    return session;
  }

  async authorizeOauthSession(input: {
    sessionId: string;
    userId: string;
    loginCode: string;
    authorizedAt: Date;
  }): Promise<void> {
    await db
      .update(oauthSessions)
      .set({
        status: 'authorized',
        userId: input.userId,
        loginCode: input.loginCode,
        authorizedAt: input.authorizedAt,
        updatedAt: touchUpdatedAtSql,
      })
      .where(eq(oauthSessions.id, input.sessionId));
  }

  async consumeOauthSession(sessionId: string, consumedAt: Date): Promise<void> {
    await db
      .update(oauthSessions)
      .set({
        status: 'consumed',
        consumedAt,
        updatedAt: touchUpdatedAtSql,
      })
      .where(eq(oauthSessions.id, sessionId));
  }

  async storeRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await db.insert(refreshTokens).values(input);
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({
        revokedAt: new Date(),
      })
      .where(eq(refreshTokens.tokenHash, tokenHash));
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  async getActiveRefreshTokenWithUser(tokenHash: string): Promise<
    | {
        token: typeof refreshTokens.$inferSelect;
        user: DbUser;
      }
    | undefined
  > {
    const [row] = await db
      .select({ token: refreshTokens, user: users })
      .from(refreshTokens)
      .innerJoin(users, eq(users.id, refreshTokens.userId))
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));

    if (!row) {
      return undefined;
    }

    if (row.token.expiresAt.getTime() <= Date.now()) {
      return undefined;
    }

    return row;
  }

  async countActiveTunnels(userId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tunnels)
      .where(and(eq(tunnels.userId, userId), eq(tunnels.status, 'active')));

    return row?.count ?? 0;
  }

  async findActiveTunnelBySlug(slug: string): Promise<DbTunnel | undefined> {
    const [tunnel] = await db
      .select()
      .from(tunnels)
      .where(and(eq(tunnels.slug, slug), eq(tunnels.status, 'active')));
    return tunnel;
  }

  async createTunnel(input: {
    userId: string;
    slug: string;
    hostname: string;
    requestedPort: number;
  }): Promise<DbTunnel> {
    const [tunnel] = await db
      .insert(tunnels)
      .values({
        userId: input.userId,
        slug: input.slug,
        hostname: input.hostname,
        requestedPort: input.requestedPort,
        status: 'creating',
      })
      .returning();

    if (!tunnel) {
      throw new Error('Failed to create tunnel.');
    }

    return tunnel;
  }

  async activateTunnel(input: {
    tunnelId: string;
    cfTunnelId: string;
    cfDnsRecordId: string;
  }): Promise<void> {
    await db
      .update(tunnels)
      .set({
        status: 'active',
        cfTunnelId: input.cfTunnelId,
        cfDnsRecordId: input.cfDnsRecordId,
        updatedAt: touchUpdatedAtSql,
      })
      .where(eq(tunnels.id, input.tunnelId));
  }

  async markTunnelFailed(tunnelId: string, errorMessage: string): Promise<void> {
    await db
      .update(tunnels)
      .set({
        status: 'failed',
        lastError: errorMessage,
        updatedAt: touchUpdatedAtSql,
      })
      .where(eq(tunnels.id, tunnelId));
  }

  async markTunnelStopping(tunnelId: string): Promise<void> {
    await db
      .update(tunnels)
      .set({ status: 'stopping', updatedAt: touchUpdatedAtSql })
      .where(eq(tunnels.id, tunnelId));
  }

  async markTunnelStopped(tunnelId: string): Promise<void> {
    await db
      .update(tunnels)
      .set({
        status: 'stopped',
        stoppedAt: new Date(),
        updatedAt: touchUpdatedAtSql,
      })
      .where(eq(tunnels.id, tunnelId));
  }

  async getTunnelById(tunnelId: string): Promise<DbTunnel | undefined> {
    const [tunnel] = await db.select().from(tunnels).where(eq(tunnels.id, tunnelId));
    return tunnel;
  }

  async findTunnelForUser(userId: string, tunnelIdentifier: string): Promise<DbTunnel | undefined> {
    const identifierClause = isUuidLike(tunnelIdentifier)
      ? eq(tunnels.id, tunnelIdentifier)
      : eq(tunnels.hostname, tunnelIdentifier);

    const [tunnel] = await db
      .select()
      .from(tunnels)
      .where(
        and(
          eq(tunnels.userId, userId),
          identifierClause,
          inArray(tunnels.status, ['active', 'stopping']),
        ),
      );
    return tunnel;
  }

  async findTunnelForUserAnyStatus(userId: string, tunnelIdentifier: string): Promise<DbTunnel | undefined> {
    const identifierClause = isUuidLike(tunnelIdentifier)
      ? eq(tunnels.id, tunnelIdentifier)
      : eq(tunnels.hostname, tunnelIdentifier);

    const [tunnel] = await db
      .select()
      .from(tunnels)
      .where(
        and(
          eq(tunnels.userId, userId),
          identifierClause,
        ),
      );
    return tunnel;
  }

  async listUserTunnels(userId: string): Promise<DbTunnel[]> {
    return db
      .select()
      .from(tunnels)
      .where(and(eq(tunnels.userId, userId), inArray(tunnels.status, ['active', 'stopping'])))
      .orderBy(asc(tunnels.createdAt));
  }

  async listUserTunnelsWithLease(
    userId: string,
    options: { includeInactive: boolean },
  ): Promise<Array<{ tunnel: DbTunnel; lease: DbTunnelLease | null }>> {
    const statuses = options.includeInactive ? null : (['active', 'stopping'] as const);
    const whereClause = statuses
      ? and(eq(tunnels.userId, userId), inArray(tunnels.status, [...statuses]))
      : eq(tunnels.userId, userId);

    const rows = await db
      .select({ tunnel: tunnels, lease: tunnelLeases })
      .from(tunnels)
      .leftJoin(tunnelLeases, eq(tunnelLeases.tunnelId, tunnels.id))
      .where(whereClause)
      .orderBy(asc(tunnels.createdAt));

    return rows.map((row) => ({
      tunnel: row.tunnel,
      lease: row.lease ?? null,
    }));
  }

  async upsertLease(tunnelId: string, now: Date, expiresAt: Date): Promise<void> {
    await db
      .insert(tunnelLeases)
      .values({
        tunnelId,
        lastHeartbeatAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: tunnelLeases.tunnelId,
        set: {
          lastHeartbeatAt: now,
          expiresAt,
        },
      });
  }

  async deleteLease(tunnelId: string): Promise<void> {
    await db.delete(tunnelLeases).where(eq(tunnelLeases.tunnelId, tunnelId));
  }

  async findStaleTunnelIds(now: Date): Promise<string[]> {
    const rows = await db
      .select({ tunnelId: tunnelLeases.tunnelId })
      .from(tunnelLeases)
      .innerJoin(tunnels, eq(tunnels.id, tunnelLeases.tunnelId))
      .where(and(lte(tunnelLeases.expiresAt, now), eq(tunnels.status, 'active')));

    return rows.map((row) => row.tunnelId);
  }

  async upsertLiveTelemetry(input: {
    tunnelId: string;
    receivedAt: Date;
    region: string | null;
    ttl: number;
    opn: number;
    rt1Ms: number | null;
    rt5Ms: number | null;
    p50Ms: number | null;
    p90Ms: number | null;
    requests: number;
    errors: number;
    bytes: number;
  }): Promise<void> {
    await db
      .insert(tunnelLiveMetrics)
      .values({
        tunnelId: input.tunnelId,
        receivedAt: input.receivedAt,
        region: input.region,
        ttl: input.ttl,
        opn: input.opn,
        rt1Ms: input.rt1Ms,
        rt5Ms: input.rt5Ms,
        p50Ms: input.p50Ms,
        p90Ms: input.p90Ms,
        requests: input.requests,
        errors: input.errors,
        bytes: input.bytes,
      })
      .onConflictDoUpdate({
        target: tunnelLiveMetrics.tunnelId,
        set: {
          receivedAt: input.receivedAt,
          region: input.region,
          ttl: input.ttl,
          opn: input.opn,
          rt1Ms: input.rt1Ms,
          rt5Ms: input.rt5Ms,
          p50Ms: input.p50Ms,
          p90Ms: input.p90Ms,
          requests: input.requests,
          errors: input.errors,
          bytes: input.bytes,
        },
      });
  }

  async insertMetricsPoint(input: {
    tunnelId: string;
    capturedAt: Date;
    ttl: number;
    opn: number;
    rt1Ms: number | null;
    rt5Ms: number | null;
    p50Ms: number | null;
    p90Ms: number | null;
    requests: number;
    errors: number;
    bytes: number;
  }): Promise<void> {
    await db.insert(tunnelMetrics).values({
      tunnelId: input.tunnelId,
      capturedAt: input.capturedAt,
      ttl: input.ttl,
      opn: input.opn,
      rt1Ms: input.rt1Ms,
      rt5Ms: input.rt5Ms,
      p50Ms: input.p50Ms,
      p90Ms: input.p90Ms,
      requests: input.requests,
      errors: input.errors,
      bytes: input.bytes,
    });
  }

  async insertRequestLogs(
    tunnelId: string,
    ingestedAt: Date,
    requests: Array<{
      startedAt: Date;
      method: string;
      path: string;
      statusCode: number;
      durationMs: number;
      responseBytes: number | null;
      error: boolean;
      protocol: 'http' | 'ws';
    }>,
  ): Promise<void> {
    if (requests.length === 0) {
      return;
    }

    await db.insert(tunnelRequests).values(
      requests.map((request) => ({
        tunnelId,
        ingestedAt,
        startedAt: request.startedAt,
        method: request.method,
        path: request.path,
        statusCode: request.statusCode,
        durationMs: request.durationMs,
        responseBytes: request.responseBytes,
        error: request.error,
        protocol: request.protocol,
      })),
    );
  }

  async listLiveTelemetryForUser(userId: string): Promise<
    Array<
      Pick<
        DbTunnelLiveMetric,
        | 'tunnelId'
        | 'receivedAt'
        | 'region'
        | 'ttl'
        | 'opn'
        | 'rt1Ms'
        | 'rt5Ms'
        | 'p50Ms'
        | 'p90Ms'
        | 'requests'
        | 'errors'
        | 'bytes'
      >
    >
  > {
    return db
      .select({
        tunnelId: tunnelLiveMetrics.tunnelId,
        receivedAt: tunnelLiveMetrics.receivedAt,
        region: tunnelLiveMetrics.region,
        ttl: tunnelLiveMetrics.ttl,
        opn: tunnelLiveMetrics.opn,
        rt1Ms: tunnelLiveMetrics.rt1Ms,
        rt5Ms: tunnelLiveMetrics.rt5Ms,
        p50Ms: tunnelLiveMetrics.p50Ms,
        p90Ms: tunnelLiveMetrics.p90Ms,
        requests: tunnelLiveMetrics.requests,
        errors: tunnelLiveMetrics.errors,
        bytes: tunnelLiveMetrics.bytes,
      })
      .from(tunnels)
      .innerJoin(tunnelLiveMetrics, eq(tunnelLiveMetrics.tunnelId, tunnels.id))
      .where(and(eq(tunnels.userId, userId), inArray(tunnels.status, ['active', 'stopping'])))
      .orderBy(asc(tunnels.createdAt));
  }

  async listMetrics(
    tunnelId: string,
    from: Date,
    to: Date,
    limit: number,
  ): Promise<
    Array<Pick<DbTunnelMetric, 'capturedAt' | 'ttl' | 'opn' | 'rt1Ms' | 'p90Ms' | 'requests' | 'errors' | 'bytes'>>
  > {
    return db
      .select({
        capturedAt: tunnelMetrics.capturedAt,
        ttl: tunnelMetrics.ttl,
        opn: tunnelMetrics.opn,
        rt1Ms: tunnelMetrics.rt1Ms,
        p90Ms: tunnelMetrics.p90Ms,
        requests: tunnelMetrics.requests,
        errors: tunnelMetrics.errors,
        bytes: tunnelMetrics.bytes,
      })
      .from(tunnelMetrics)
      .where(
        and(
          eq(tunnelMetrics.tunnelId, tunnelId),
          gte(tunnelMetrics.capturedAt, from),
          lte(tunnelMetrics.capturedAt, to),
        ),
      )
      .orderBy(asc(tunnelMetrics.capturedAt))
      .limit(limit);
  }

  async listRequests(
    tunnelId: string,
    after: Date | null,
    limit: number,
  ): Promise<
    Array<
      Pick<
        DbTunnelRequest,
        | 'ingestedAt'
        | 'startedAt'
        | 'method'
        | 'path'
        | 'statusCode'
        | 'durationMs'
        | 'responseBytes'
        | 'error'
        | 'protocol'
      >
    >
  > {
    const filters = [eq(tunnelRequests.tunnelId, tunnelId)];
    if (after) {
      filters.push(gt(tunnelRequests.ingestedAt, after));
    }

    return db
      .select({
        ingestedAt: tunnelRequests.ingestedAt,
        startedAt: tunnelRequests.startedAt,
        method: tunnelRequests.method,
        path: tunnelRequests.path,
        statusCode: tunnelRequests.statusCode,
        durationMs: tunnelRequests.durationMs,
        responseBytes: tunnelRequests.responseBytes,
        error: tunnelRequests.error,
        protocol: tunnelRequests.protocol,
      })
      .from(tunnelRequests)
      .where(and(...filters))
      .orderBy(asc(tunnelRequests.ingestedAt))
      .limit(limit);
  }

  async pruneTelemetry(input: { metricsOlderThan: Date; requestsOlderThan: Date }): Promise<void> {
    await db.delete(tunnelRequests).where(lte(tunnelRequests.ingestedAt, input.requestsOlderThan));
    await db.delete(tunnelMetrics).where(lte(tunnelMetrics.capturedAt, input.metricsOlderThan));
  }

  async enqueueCleanupJob(tunnelId: string, reason: string): Promise<void> {
    const existing = await db
      .select()
      .from(cleanupJobs)
      .where(and(eq(cleanupJobs.tunnelId, tunnelId), inArray(cleanupJobs.status, ['queued', 'processing'])));

    if (existing.length > 0) {
      return;
    }

    await db.insert(cleanupJobs).values({
      tunnelId,
      reason,
      status: 'queued',
      attemptCount: 0,
      nextAttemptAt: new Date(),
    });
  }

  async claimDueJobs(now: Date, limit = 20): Promise<DbCleanupJob[]> {
    const candidates = await db
      .select()
      .from(cleanupJobs)
      .where(and(inArray(cleanupJobs.status, ['queued', 'failed']), lte(cleanupJobs.nextAttemptAt, now)))
      .orderBy(asc(cleanupJobs.createdAt))
      .limit(limit);

    const claimed: DbCleanupJob[] = [];

    for (const candidate of candidates) {
      const [updated] = await db
        .update(cleanupJobs)
        .set({
          status: 'processing',
          updatedAt: touchUpdatedAtSql,
        })
        .where(and(eq(cleanupJobs.id, candidate.id), eq(cleanupJobs.status, candidate.status)))
        .returning();

      if (updated) {
        claimed.push(updated);
      }
    }

    return claimed;
  }

  async markCleanupJobDone(jobId: string): Promise<void> {
    await db
      .update(cleanupJobs)
      .set({ status: 'done', updatedAt: touchUpdatedAtSql })
      .where(eq(cleanupJobs.id, jobId));
  }

  async markCleanupJobFailed(input: {
    jobId: string;
    attemptCount: number;
    nextAttemptAt: Date;
    message: string;
  }): Promise<void> {
    await db
      .update(cleanupJobs)
      .set({
        status: 'failed',
        attemptCount: input.attemptCount,
        nextAttemptAt: input.nextAttemptAt,
        lastError: input.message,
        updatedAt: touchUpdatedAtSql,
      })
      .where(eq(cleanupJobs.id, input.jobId));
  }

  async createAuditLog(input: {
    userId?: string;
    action: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await db.insert(auditLogs).values({
      userId: input.userId,
      action: input.action,
      metadata: input.metadata,
    });
  }
}

export const repository = new Repository();
