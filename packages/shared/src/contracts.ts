import { z } from 'zod';

export const DEFAULT_ALLOWED_EMAIL_DOMAIN = '@example.com';

/**
 * @deprecated Use ALLOWED_EMAIL_DOMAIN runtime config in API only.
 */
export const EMAIL_DOMAIN = DEFAULT_ALLOWED_EMAIL_DOMAIN;

export const tunnelSlugRegex = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;

export const tunnelCreateRequestSchema = z.object({
  port: z.number().int().min(1).max(65535),
  requestedSlug: z.string().optional(),
});

export type TunnelCreateRequest = z.infer<typeof tunnelCreateRequestSchema>;

export const tunnelCreateResponseSchema = z.object({
  tunnelId: z.string().uuid(),
  hostname: z.string(),
  cloudflaredToken: z.string(),
  tunnelRunToken: z.string().min(1),
  heartbeatIntervalSec: z.number().int().positive(),
  leaseTimeoutSec: z.number().int().positive(),
}).strict();

export type TunnelCreateResponse = z.infer<typeof tunnelCreateResponseSchema>;

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const userProfileSchema = z.object({
  email: z.string().email(),
  slackUserId: z.string(),
  slackTeamId: z.string(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

export const authStartRequestSchema = z.object({
  email: z.string().email(),
  codeChallenge: z.string().min(10),
});

export const authStartResponseSchema = z.object({
  authorizeUrl: z.string().url(),
  state: z.string(),
});

export const authStatusRequestSchema = z
  .object({
    state: z.string().min(10),
  })
  .strict();

export const authStatusResponseSchema = z
  .object({
    status: z.enum(['pending', 'authorized', 'expired']),
    loginCode: z.string().min(10).optional(),
  })
  .strict();

export const authExchangeRequestSchema = z.object({
  loginCode: z.string().min(10),
  codeVerifier: z.string().min(43).max(128),
});

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresInSec: z.number().int().positive(),
  profile: userProfileSchema,
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(10),
});

export const heartbeatResponseSchema = z.object({
  ok: z.literal(true),
  expiresAt: z.string(),
});

export const tunnelStatusSchema = z.enum(['creating', 'active', 'stopping', 'stopped', 'failed']);
export type TunnelStatus = z.infer<typeof tunnelStatusSchema>;

export const adminRoleSchema = z.enum(['member', 'owner']);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const adminBootstrapStatusSchema = z
  .object({
    ownerExists: z.boolean(),
    firstLoginClaimsOwner: z.boolean(),
  })
  .strict();

export type AdminBootstrapStatus = z.infer<typeof adminBootstrapStatusSchema>;

export const adminWebAuthStartResponseSchema = authStartResponseSchema;
export type AdminWebAuthStartResponse = z.infer<typeof adminWebAuthStartResponseSchema>;

export const adminWebAuthExchangeRequestSchema = z
  .object({
    loginCode: z.string().min(10),
  })
  .strict();

export type AdminWebAuthExchangeRequest = z.infer<typeof adminWebAuthExchangeRequestSchema>;

export const adminOwnerAccessErrorSchema = apiErrorSchema.extend({
  code: z.enum(['OWNER_ACCESS_REQUIRED']),
});

export type AdminOwnerAccessError = z.infer<typeof adminOwnerAccessErrorSchema>;

export const adminSessionUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    slackUserId: z.string(),
    slackTeamId: z.string(),
    role: adminRoleSchema,
    roleGrantedAt: z.string().nullable(),
  })
  .strict();

export type AdminSessionUser = z.infer<typeof adminSessionUserSchema>;

export const adminSessionSchema = z
  .object({
    user: adminSessionUserSchema,
  })
  .strict();

export type AdminSession = z.infer<typeof adminSessionSchema>;

export const adminActivityEventSchema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.string(),
    action: z.string(),
    userId: z.string().uuid().nullable(),
    userEmail: z.string().email().nullable(),
    metadata: z.record(z.unknown()).nullable(),
  })
  .strict();

export type AdminActivityEvent = z.infer<typeof adminActivityEventSchema>;

export const adminActivityResponseSchema = z.array(adminActivityEventSchema);
export type AdminActivityResponse = z.infer<typeof adminActivityResponseSchema>;

export const adminUserSummarySchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    slackUserId: z.string(),
    slackTeamId: z.string(),
    role: adminRoleSchema,
    roleGrantedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    activeTunnelCount: z.number().int().nonnegative(),
    totalTunnelCount: z.number().int().nonnegative(),
    lastAuditAt: z.string().nullable(),
  })
  .strict();

export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminUsersListResponseSchema = z.array(adminUserSummarySchema);
export type AdminUsersListResponse = z.infer<typeof adminUsersListResponseSchema>;

export const adminTunnelLiveSnapshotSchema = z
  .object({
    receivedAt: z.string().nullable(),
    region: z.string().nullable(),
    ttl: z.number().int().nonnegative().nullable(),
    opn: z.number().int().nonnegative(),
    rt1Ms: z.number().nonnegative().nullable(),
    p90Ms: z.number().nonnegative().nullable(),
    requests: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
    lastHeartbeatAt: z.string().nullable(),
    expiresAt: z.string().nullable(),
  })
  .strict();

export type AdminTunnelLiveSnapshot = z.infer<typeof adminTunnelLiveSnapshotSchema>;

export const adminTunnelSummarySchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    userEmail: z.string().email(),
    hostname: z.string(),
    slug: z.string(),
    status: tunnelStatusSchema,
    requestedPort: z.number().int().min(1).max(65535),
    createdAt: z.string(),
    stoppedAt: z.string().nullable(),
    lastError: z.string().nullable(),
    live: adminTunnelLiveSnapshotSchema,
  })
  .strict();

export type AdminTunnelSummary = z.infer<typeof adminTunnelSummarySchema>;

export const adminTunnelsListResponseSchema = z.array(adminTunnelSummarySchema);
export type AdminTunnelsListResponse = z.infer<typeof adminTunnelsListResponseSchema>;

export const adminTunnel24hSummarySchema = z
  .object({
    requests: z.number().int().nonnegative(),
    errorRate: z.number().min(0).max(100),
    bytes: z.number().int().nonnegative(),
    averageDurationMs: z.number().nonnegative().nullable(),
  })
  .strict();

export type AdminTunnel24hSummary = z.infer<typeof adminTunnel24hSummarySchema>;

export const adminTunnelDetailResponseSchema = z
  .object({
    tunnel: adminTunnelSummarySchema,
    last24h: adminTunnel24hSummarySchema,
  })
  .strict();

export type AdminTunnelDetailResponse = z.infer<typeof adminTunnelDetailResponseSchema>;

export const adminStatusBreakdownItemSchema = z
  .object({
    status: tunnelStatusSchema,
    count: z.number().int().nonnegative(),
  })
  .strict();

export type AdminStatusBreakdownItem = z.infer<typeof adminStatusBreakdownItemSchema>;

export const adminRequestVolumePointSchema = z
  .object({
    bucketStart: z.string(),
    requests: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
  })
  .strict();

export type AdminRequestVolumePoint = z.infer<typeof adminRequestVolumePointSchema>;

export const adminBandwidthPointSchema = z
  .object({
    bucketStart: z.string(),
    bytes: z.number().int().nonnegative(),
  })
  .strict();

export type AdminBandwidthPoint = z.infer<typeof adminBandwidthPointSchema>;

export const adminDashboardSchema = z
  .object({
    summary: z
      .object({
        totalUsers: z.number().int().nonnegative(),
        activeTunnels: z.number().int().nonnegative(),
        liveOpenConnections: z.number().int().nonnegative(),
        requestsLast24h: z.number().int().nonnegative(),
        errorRateLast24h: z.number().min(0).max(100),
        bytesLast24h: z.number().int().nonnegative(),
        pendingCleanupJobs: z.number().int().nonnegative(),
      })
      .strict(),
    tunnelStatusBreakdown: z.array(adminStatusBreakdownItemSchema),
    requestVolume24h: z.array(adminRequestVolumePointSchema),
    bandwidth24h: z.array(adminBandwidthPointSchema),
    liveTunnels: adminTunnelsListResponseSchema,
    users: adminUsersListResponseSchema,
    recentActivity: adminActivityResponseSchema,
  })
  .strict();

export type AdminDashboard = z.infer<typeof adminDashboardSchema>;

export const tunnelLeaseSchema = z
  .object({
    lastHeartbeatAt: z.string(),
    expiresAt: z.string(),
  })
  .strict()
  .nullable();

export type TunnelLease = z.infer<typeof tunnelLeaseSchema>;

export const tunnelSummarySchema = z
  .object({
    id: z.string().uuid(),
    hostname: z.string(),
    slug: z.string(),
    status: tunnelStatusSchema,
    requestedPort: z.number().int().min(1).max(65535),
    createdAt: z.string(),
    lease: tunnelLeaseSchema,
    stoppedAt: z.string().nullable(),
    lastError: z.string().nullable(),
  })
  .strict();

export type TunnelSummary = z.infer<typeof tunnelSummarySchema>;

export const tunnelListResponseSchema = z.array(tunnelSummarySchema);

export const tunnelTelemetryMetricsSchema = z
  .object({
    ttl: z.number().int().nonnegative(),
    opn: z.number().int().nonnegative(),
    rt1Ms: z.number().nonnegative().nullable(),
    rt5Ms: z.number().nonnegative().nullable(),
    p50Ms: z.number().nonnegative().nullable(),
    p90Ms: z.number().nonnegative().nullable(),
    requests: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
  })
  .strict();

export type TunnelTelemetryMetrics = z.infer<typeof tunnelTelemetryMetricsSchema>;

export const tunnelTelemetryRequestEventSchema = z
  .object({
    startedAtEpochMs: z.number().int().nonnegative(),
    method: z.string().min(1).max(16),
    path: z.string().min(1).max(512),
    statusCode: z.number().int().min(100).max(599),
    durationMs: z.number().nonnegative(),
    responseBytes: z.number().int().nonnegative().nullable(),
    error: z.boolean(),
    protocol: z.enum(['http', 'ws']),
  })
  .strict();

export type TunnelTelemetryRequestEvent = z.infer<typeof tunnelTelemetryRequestEventSchema>;

export const tunnelTelemetryIngestRequestSchema = z
  .object({
    region: z.string().max(16).nullable().optional(),
    metrics: tunnelTelemetryMetricsSchema,
    requests: z.array(tunnelTelemetryRequestEventSchema).max(200),
  })
  .strict();

export type TunnelTelemetryIngestRequest = z.infer<typeof tunnelTelemetryIngestRequestSchema>;

export const tunnelTelemetryIngestResponseSchema = z.object({ ok: z.literal(true) }).strict();

export const tunnelLiveTelemetrySchema = z
  .object({
    tunnelId: z.string().uuid(),
    receivedAt: z.string(),
    region: z.string().nullable(),
    metrics: tunnelTelemetryMetricsSchema,
  })
  .strict();

export type TunnelLiveTelemetry = z.infer<typeof tunnelLiveTelemetrySchema>;

export const tunnelLiveTelemetryResponseSchema = z.array(tunnelLiveTelemetrySchema);

export const tunnelMetricsPointSchema = z
  .object({
    capturedAt: z.string(),
    ttl: z.number().int().nonnegative(),
    opn: z.number().int().nonnegative(),
    rt1Ms: z.number().nonnegative().nullable(),
    p90Ms: z.number().nonnegative().nullable(),
    requests: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
  })
  .strict();

export type TunnelMetricsPoint = z.infer<typeof tunnelMetricsPointSchema>;

export const tunnelMetricsResponseSchema = z.array(tunnelMetricsPointSchema);

export const tunnelRequestLogSchema = z
  .object({
    ingestedAt: z.string(),
    startedAt: z.string(),
    method: z.string(),
    path: z.string(),
    statusCode: z.number().int(),
    durationMs: z.number(),
    responseBytes: z.number().int().nonnegative().nullable(),
    error: z.boolean(),
    protocol: z.enum(['http', 'ws']),
  })
  .strict();

export type TunnelRequestLog = z.infer<typeof tunnelRequestLogSchema>;

export const tunnelRequestsResponseSchema = z.array(tunnelRequestLogSchema);
