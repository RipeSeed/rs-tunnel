import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import { db } from './client.js';
import {
  auditLogs,
  cleanupJobs,
  oauthSessions,
  refreshTokens,
  touchUpdatedAtSql,
  tunnelLeases,
  tunnels,
  users,
  type DbCleanupJob,
  type DbOAuthSession,
  type DbTunnel,
  type DbUser,
} from './schema.js';

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
    const [tunnel] = await db
      .select()
      .from(tunnels)
      .where(
        and(
          eq(tunnels.userId, userId),
          or(eq(tunnels.id, tunnelIdentifier), eq(tunnels.hostname, tunnelIdentifier)),
          inArray(tunnels.status, ['active', 'stopping']),
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
