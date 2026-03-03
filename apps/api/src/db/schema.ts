import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  slackUserId: varchar('slack_user_id', { length: 255 }).notNull(),
  slackTeamId: varchar('slack_team_id', { length: 255 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oauthSessions = pgTable(
  'oauth_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    state: varchar('state', { length: 255 }).notNull(),
    codeChallenge: varchar('code_challenge', { length: 255 }).notNull(),
    cliCallbackUrl: text('cli_callback_url').notNull(),
    loginCode: varchar('login_code', { length: 255 }),
    userId: uuid('user_id').references(() => users.id),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    oauthStateIdx: uniqueIndex('oauth_sessions_state_idx').on(table.state),
    oauthLoginCodeIdx: uniqueIndex('oauth_sessions_login_code_idx').on(table.loginCode),
  }),
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    refreshTokenHashIdx: uniqueIndex('refresh_tokens_token_hash_idx').on(table.tokenHash),
  }),
);

export const tunnels = pgTable(
  'tunnels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 32 }).notNull(),
    hostname: varchar('hostname', { length: 255 }).notNull(),
    requestedPort: integer('requested_port').notNull(),
    cfTunnelId: varchar('cf_tunnel_id', { length: 255 }),
    cfDnsRecordId: varchar('cf_dns_record_id', { length: 255 }),
    status: varchar('status', { length: 32 }).notNull().default('creating'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    stoppedAt: timestamp('stopped_at', { withTimezone: true }),
  },
  (table) => ({
    hostnameIdx: uniqueIndex('tunnels_hostname_idx')
      .on(table.hostname)
      .where(sql`status != 'stopped'`),
    tunnelUserStatusIdx: index('tunnels_user_status_idx').on(table.userId, table.status),
    tunnelSlugStatusIdx: index('tunnels_slug_status_idx').on(table.slug, table.status),
  }),
);

export const tunnelLeases = pgTable(
  'tunnel_leases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tunnelId: uuid('tunnel_id')
      .notNull()
      .references(() => tunnels.id, { onDelete: 'cascade' }),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    leaseTunnelIdIdx: uniqueIndex('tunnel_leases_tunnel_id_idx').on(table.tunnelId),
    leaseExpiresAtIdx: index('tunnel_leases_expires_at_idx').on(table.expiresAt),
  }),
);

export const tunnelLiveMetrics = pgTable(
  'tunnel_live_metrics',
  {
    tunnelId: uuid('tunnel_id')
      .notNull()
      .primaryKey()
      .references(() => tunnels.id, { onDelete: 'cascade' }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    region: varchar('region', { length: 16 }),
    ttl: integer('ttl').notNull(),
    opn: integer('opn').notNull(),
    rt1Ms: integer('rt1_ms'),
    rt5Ms: integer('rt5_ms'),
    p50Ms: integer('p50_ms'),
    p90Ms: integer('p90_ms'),
    requests: integer('requests').notNull(),
    errors: integer('errors').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
  },
  (table) => ({
    receivedAtIdx: index('tunnel_live_metrics_received_at_idx').on(table.receivedAt),
  }),
);

export const tunnelMetrics = pgTable(
  'tunnel_metrics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tunnelId: uuid('tunnel_id')
      .notNull()
      .references(() => tunnels.id, { onDelete: 'cascade' }),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    ttl: integer('ttl').notNull(),
    opn: integer('opn').notNull(),
    rt1Ms: integer('rt1_ms'),
    rt5Ms: integer('rt5_ms'),
    p50Ms: integer('p50_ms'),
    p90Ms: integer('p90_ms'),
    requests: integer('requests').notNull(),
    errors: integer('errors').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
  },
  (table) => ({
    tunnelCapturedAtIdx: index('tunnel_metrics_tunnel_captured_at_idx').on(table.tunnelId, table.capturedAt),
  }),
);

export const tunnelRequests = pgTable(
  'tunnel_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tunnelId: uuid('tunnel_id')
      .notNull()
      .references(() => tunnels.id, { onDelete: 'cascade' }),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    method: varchar('method', { length: 16 }).notNull(),
    path: text('path').notNull(),
    statusCode: integer('status_code').notNull(),
    durationMs: integer('duration_ms').notNull(),
    responseBytes: integer('response_bytes'),
    protocol: varchar('protocol', { length: 4 }).notNull(),
    error: boolean('error').notNull(),
  },
  (table) => ({
    tunnelIngestedAtIdx: index('tunnel_requests_tunnel_ingested_at_idx').on(table.tunnelId, table.ingestedAt),
    tunnelStatusCodeIdx: index('tunnel_requests_tunnel_status_code_idx').on(table.tunnelId, table.statusCode),
  }),
);

export const cleanupJobs = pgTable(
  'cleanup_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tunnelId: uuid('tunnel_id')
      .notNull()
      .references(() => tunnels.id, { onDelete: 'cascade' }),
    reason: varchar('reason', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('queued'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cleanupStatusIdx: index('cleanup_jobs_status_next_attempt_idx').on(table.status, table.nextAttemptAt),
  }),
);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 64 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  tunnels: many(tunnels),
  oauthSessions: many(oauthSessions),
  auditLogs: many(auditLogs),
}));

export const tunnelRelations = relations(tunnels, ({ one, many }) => ({
  user: one(users, {
    fields: [tunnels.userId],
    references: [users.id],
  }),
  lease: one(tunnelLeases, {
    fields: [tunnels.id],
    references: [tunnelLeases.tunnelId],
  }),
  cleanupJobs: many(cleanupJobs),
  liveMetrics: one(tunnelLiveMetrics, {
    fields: [tunnels.id],
    references: [tunnelLiveMetrics.tunnelId],
  }),
  metrics: many(tunnelMetrics),
  requests: many(tunnelRequests),
}));

export const touchUpdatedAtSql = sql`now()`;

export type DbUser = typeof users.$inferSelect;
export type DbOAuthSession = typeof oauthSessions.$inferSelect;
export type DbTunnel = typeof tunnels.$inferSelect;
export type DbTunnelLease = typeof tunnelLeases.$inferSelect;
export type DbTunnelLiveMetric = typeof tunnelLiveMetrics.$inferSelect;
export type DbTunnelMetric = typeof tunnelMetrics.$inferSelect;
export type DbTunnelRequest = typeof tunnelRequests.$inferSelect;
export type DbCleanupJob = typeof cleanupJobs.$inferSelect;
