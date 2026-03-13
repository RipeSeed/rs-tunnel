import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, sql } from 'drizzle-orm';

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
  type DbAuditLog,
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

function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
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

  async getOwnerUser(): Promise<DbUser | undefined> {
    const [user] = await db.select().from(users).where(eq(users.adminRole, 'owner'));
    return user;
  }

  async hasOwnerUser(): Promise<boolean> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.adminRole, 'owner'));

    return (row?.count ?? 0) > 0;
  }

  async claimOwnerIfMissing(userId: string, roleGrantedAt: Date): Promise<DbUser | undefined> {
    try {
      const [user] = await db
        .update(users)
        .set({
          adminRole: 'owner',
          roleGrantedAt,
          updatedAt: touchUpdatedAtSql,
        })
        .where(and(eq(users.id, userId), sql`not exists (select 1 from users where admin_role = 'owner')`))
        .returning();

      if (user) {
        return user;
      }
    } catch (error) {
      if (!isPgUniqueViolation(error)) {
        throw error;
      }
    }

    return this.getUserById(userId);
  }

  async createOauthSession(input: {
    email: string;
    state: string;
    codeChallenge: string;
    cliCallbackUrl: string;
    flow: 'cli' | 'web';
    expiresAt: Date;
  }): Promise<DbOAuthSession> {
    const [session] = await db
      .insert(oauthSessions)
      .values({
        email: input.email,
        state: input.state,
        codeChallenge: input.codeChallenge,
        cliCallbackUrl: input.cliCallbackUrl,
        flow: input.flow,
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

  async countUsers(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    return row?.count ?? 0;
  }

  async countOrgActiveTunnels(): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tunnels)
      .where(eq(tunnels.status, 'active'));

    return row?.count ?? 0;
  }

  async countPendingCleanupJobs(): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(cleanupJobs)
      .where(inArray(cleanupJobs.status, ['queued', 'failed', 'processing']));

    return row?.count ?? 0;
  }

  async getOrgLiveOpenConnections(): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${tunnelLiveMetrics.opn}), 0)::int` })
      .from(tunnelLiveMetrics)
      .innerJoin(tunnels, eq(tunnels.id, tunnelLiveMetrics.tunnelId))
      .where(inArray(tunnels.status, ['active', 'stopping']));

    return row?.total ?? 0;
  }

  async getOrgTrafficSummary(since: Date): Promise<{ requests: number; errors: number; bytes: number }> {
    const [row] = await db
      .select({
        requests: sql<number>`count(*)::int`,
        errors: sql<number>`count(*) filter (where ${tunnelRequests.error})::int`,
        bytes: sql<number>`coalesce(sum(coalesce(${tunnelRequests.responseBytes}, 0)), 0)::double precision`,
      })
      .from(tunnelRequests)
      .where(gte(tunnelRequests.ingestedAt, since));

    return {
      requests: row?.requests ?? 0,
      errors: row?.errors ?? 0,
      bytes: Math.max(0, Math.round(row?.bytes ?? 0)),
    };
  }

  async listOrgTunnelStatusCounts(): Promise<Array<{ status: string; count: number }>> {
    return db
      .select({
        status: tunnels.status,
        count: sql<number>`count(*)::int`,
      })
      .from(tunnels)
      .groupBy(tunnels.status)
      .orderBy(asc(tunnels.status));
  }

  async listOrgRequestVolumeByHour(since: Date): Promise<Array<{ bucketStart: Date; requests: number; errors: number }>> {
    const bucketStart = sql<Date>`date_trunc('hour', ${tunnelRequests.ingestedAt})`;

    return db
      .select({
        bucketStart,
        requests: sql<number>`count(*)::int`,
        errors: sql<number>`count(*) filter (where ${tunnelRequests.error})::int`,
      })
      .from(tunnelRequests)
      .where(gte(tunnelRequests.ingestedAt, since))
      .groupBy(bucketStart)
      .orderBy(asc(bucketStart));
  }

  async listOrgBandwidthByHour(since: Date): Promise<Array<{ bucketStart: Date; bytes: number }>> {
    const bucketStart = sql<Date>`date_trunc('hour', ${tunnelRequests.ingestedAt})`;

    const rows = await db
      .select({
        bucketStart,
        bytes: sql<number>`coalesce(sum(coalesce(${tunnelRequests.responseBytes}, 0)), 0)::double precision`,
      })
      .from(tunnelRequests)
      .where(gte(tunnelRequests.ingestedAt, since))
      .groupBy(bucketStart)
      .orderBy(asc(bucketStart));

    return rows.map((row) => ({
      bucketStart: row.bucketStart,
      bytes: Math.max(0, Math.round(row.bytes)),
    }));
  }

  async listAdminUsers(limit?: number): Promise<
    Array<{
      user: DbUser;
      activeTunnelCount: number;
      totalTunnelCount: number;
      lastAuditAt: Date | null;
    }>
  > {
    const baseQuery = db
      .select({
        user: users,
        activeTunnelCount:
          sql<number>`count(distinct case when ${tunnels.status} in ('active', 'stopping') then ${tunnels.id} end)::int`,
        totalTunnelCount: sql<number>`count(distinct ${tunnels.id})::int`,
        lastAuditAt: sql<Date | null>`max(${auditLogs.createdAt})`,
      })
      .from(users)
      .leftJoin(tunnels, eq(tunnels.userId, users.id))
      .leftJoin(auditLogs, eq(auditLogs.userId, users.id))
      .groupBy(users.id)
      .orderBy(desc(sql`case when ${users.adminRole} = 'owner' then 1 else 0 end`), desc(users.createdAt));

    return limit ? baseQuery.limit(limit) : baseQuery;
  }

  async listAdminTunnels(limit?: number): Promise<
    Array<{
      id: string;
      userId: string;
      userEmail: string;
      hostname: string;
      slug: string;
      status: string;
      requestedPort: number;
      createdAt: Date;
      stoppedAt: Date | null;
      lastError: string | null;
      receivedAt: Date | null;
      region: string | null;
      ttl: number | null;
      opn: number;
      rt1Ms: number | null;
      p90Ms: number | null;
      requests: number;
      errors: number;
      bytes: number;
      lastHeartbeatAt: Date | null;
      expiresAt: Date | null;
    }>
  > {
    const baseQuery = db
      .select({
        id: tunnels.id,
        userId: users.id,
        userEmail: users.email,
        hostname: tunnels.hostname,
        slug: tunnels.slug,
        status: tunnels.status,
        requestedPort: tunnels.requestedPort,
        createdAt: tunnels.createdAt,
        stoppedAt: tunnels.stoppedAt,
        lastError: tunnels.lastError,
        receivedAt: tunnelLiveMetrics.receivedAt,
        region: tunnelLiveMetrics.region,
        ttl: tunnelLiveMetrics.ttl,
        opn: sql<number>`coalesce(${tunnelLiveMetrics.opn}, 0)::int`,
        rt1Ms: tunnelLiveMetrics.rt1Ms,
        p90Ms: tunnelLiveMetrics.p90Ms,
        requests: sql<number>`coalesce(${tunnelLiveMetrics.requests}, 0)::int`,
        errors: sql<number>`coalesce(${tunnelLiveMetrics.errors}, 0)::int`,
        bytes: sql<number>`coalesce(${tunnelLiveMetrics.bytes}, 0)::int`,
        lastHeartbeatAt: tunnelLeases.lastHeartbeatAt,
        expiresAt: tunnelLeases.expiresAt,
      })
      .from(tunnels)
      .innerJoin(users, eq(users.id, tunnels.userId))
      .leftJoin(tunnelLiveMetrics, eq(tunnelLiveMetrics.tunnelId, tunnels.id))
      .leftJoin(tunnelLeases, eq(tunnelLeases.tunnelId, tunnels.id))
      .orderBy(
        desc(sql`case when ${tunnels.status} = 'active' then 1 else 0 end`),
        desc(sql`case when ${tunnels.status} = 'stopping' then 1 else 0 end`),
        desc(tunnels.createdAt),
      );

    return limit ? baseQuery.limit(limit) : baseQuery;
  }

  async getAdminTunnelById(tunnelId: string): Promise<
    | {
        id: string;
        userId: string;
        userEmail: string;
        hostname: string;
        slug: string;
        status: string;
        requestedPort: number;
        createdAt: Date;
        stoppedAt: Date | null;
        lastError: string | null;
        receivedAt: Date | null;
        region: string | null;
        ttl: number | null;
        opn: number;
        rt1Ms: number | null;
        p90Ms: number | null;
        requests: number;
        errors: number;
        bytes: number;
        lastHeartbeatAt: Date | null;
        expiresAt: Date | null;
      }
    | undefined
  > {
    const [row] = await db
      .select({
        id: tunnels.id,
        userId: users.id,
        userEmail: users.email,
        hostname: tunnels.hostname,
        slug: tunnels.slug,
        status: tunnels.status,
        requestedPort: tunnels.requestedPort,
        createdAt: tunnels.createdAt,
        stoppedAt: tunnels.stoppedAt,
        lastError: tunnels.lastError,
        receivedAt: tunnelLiveMetrics.receivedAt,
        region: tunnelLiveMetrics.region,
        ttl: tunnelLiveMetrics.ttl,
        opn: sql<number>`coalesce(${tunnelLiveMetrics.opn}, 0)::int`,
        rt1Ms: tunnelLiveMetrics.rt1Ms,
        p90Ms: tunnelLiveMetrics.p90Ms,
        requests: sql<number>`coalesce(${tunnelLiveMetrics.requests}, 0)::int`,
        errors: sql<number>`coalesce(${tunnelLiveMetrics.errors}, 0)::int`,
        bytes: sql<number>`coalesce(${tunnelLiveMetrics.bytes}, 0)::int`,
        lastHeartbeatAt: tunnelLeases.lastHeartbeatAt,
        expiresAt: tunnelLeases.expiresAt,
      })
      .from(tunnels)
      .innerJoin(users, eq(users.id, tunnels.userId))
      .leftJoin(tunnelLiveMetrics, eq(tunnelLiveMetrics.tunnelId, tunnels.id))
      .leftJoin(tunnelLeases, eq(tunnelLeases.tunnelId, tunnels.id))
      .where(eq(tunnels.id, tunnelId));

    return row;
  }

  async getTunnelTrafficSummary(tunnelId: string, since: Date): Promise<{
    requests: number;
    errors: number;
    bytes: number;
    averageDurationMs: number | null;
  }> {
    const [row] = await db
      .select({
        requests: sql<number>`count(*)::int`,
        errors: sql<number>`count(*) filter (where ${tunnelRequests.error})::int`,
        bytes: sql<number>`coalesce(sum(coalesce(${tunnelRequests.responseBytes}, 0)), 0)::double precision`,
        averageDurationMs: sql<number | null>`nullif(avg(${tunnelRequests.durationMs})::double precision, 'NaN'::double precision)`,
      })
      .from(tunnelRequests)
      .where(and(eq(tunnelRequests.tunnelId, tunnelId), gte(tunnelRequests.ingestedAt, since)));

    return {
      requests: row?.requests ?? 0,
      errors: row?.errors ?? 0,
      bytes: Math.max(0, Math.round(row?.bytes ?? 0)),
      averageDurationMs:
        row?.averageDurationMs === null || row?.averageDurationMs === undefined
          ? null
          : Math.max(0, Number(row.averageDurationMs)),
    };
  }

  async listRecentActivity(limit: number): Promise<Array<{ audit: DbAuditLog; userEmail: string | null }>> {
    return db
      .select({
        audit: auditLogs,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
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
