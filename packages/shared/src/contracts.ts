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
  heartbeatIntervalSec: z.literal(20),
});

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
  cliCallbackUrl: z.string().url(),
});

export const authStartResponseSchema = z.object({
  authorizeUrl: z.string().url(),
  state: z.string(),
});

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

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(10),
});

export const heartbeatResponseSchema = z.object({
  ok: z.literal(true),
  expiresAt: z.string(),
});

export const tunnelStatusSchema = z.enum(['creating', 'active', 'stopping', 'stopped', 'failed']);
export type TunnelStatus = z.infer<typeof tunnelStatusSchema>;

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
