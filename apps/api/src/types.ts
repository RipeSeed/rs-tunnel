import type { UserProfile } from '@ripeseed/shared';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  slackUserId: string;
  slackTeamId: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  profile: UserProfile;
};

export type TunnelLeaseSummary = {
  lastHeartbeatAt: string;
  expiresAt: string;
} | null;

export type TunnelSummary = {
  id: string;
  hostname: string;
  slug: string;
  status: string;
  requestedPort: number;
  createdAt: string;
  lease: TunnelLeaseSummary;
  stoppedAt: string | null;
  lastError: string | null;
};

export type TunnelTelemetryMetrics = {
  ttl: number;
  opn: number;
  rt1Ms: number | null;
  rt5Ms: number | null;
  p50Ms: number | null;
  p90Ms: number | null;
  requests: number;
  errors: number;
  bytes: number;
};

export type TunnelTelemetryRequestEvent = {
  startedAtEpochMs: number;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  responseBytes: number | null;
  error: boolean;
  protocol: 'http' | 'ws';
};

export type TunnelLiveTelemetry = {
  tunnelId: string;
  receivedAt: string;
  region: string | null;
  metrics: TunnelTelemetryMetrics;
};

export type TunnelMetricsPoint = {
  capturedAt: string;
  ttl: number;
  opn: number;
  rt1Ms: number | null;
  p90Ms: number | null;
  requests: number;
  errors: number;
  bytes: number;
};

export type TunnelRequestLog = {
  ingestedAt: string;
  startedAt: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  responseBytes: number | null;
  error: boolean;
  protocol: 'http' | 'ws';
};

export interface AuthService {
  startSlackAuth(input: { email: string; codeChallenge: string; cliCallbackUrl: string }): Promise<{
    authorizeUrl: string;
    state: string;
  }>;
  handleSlackCallback(input: { state: string; code: string }): Promise<{ redirectUrl: string }>;
  exchangeLoginCode(input: { loginCode: string; codeVerifier: string }): Promise<TokenPair>;
  refreshTokens(refreshToken: string): Promise<TokenPair>;
  logout(input: { userId?: string; refreshToken?: string }): Promise<void>;
}

export interface TunnelService {
  createTunnel(input: { userId: string; port: number; requestedSlug?: string }): Promise<{
    tunnelId: string;
    hostname: string;
    cloudflaredToken: string;
    heartbeatIntervalSec: 20;
  }>;
  listTunnels(userId: string, options?: { includeInactive?: boolean }): Promise<TunnelSummary[]>;
  heartbeat(input: { userId: string; tunnelIdentifier: string }): Promise<{ expiresAt: string }>;
  stopTunnel(input: { userId: string; tunnelIdentifier: string }): Promise<void>;
  stopTunnelById(tunnelId: string, reason: string): Promise<void>;
}

export interface TelemetryService {
  ingestTelemetry(input: {
    userId: string;
    tunnelIdentifier: string;
    region?: string | null;
    metrics: TunnelTelemetryMetrics;
    requests: TunnelTelemetryRequestEvent[];
  }): Promise<void>;
  getLiveTelemetry(userId: string): Promise<TunnelLiveTelemetry[]>;
  getMetricsHistory(input: { userId: string; tunnelId: string; from: Date; to: Date; limit: number }): Promise<
    TunnelMetricsPoint[]
  >;
  getRequestLogs(input: { userId: string; tunnelId: string; after: Date | null; limit: number }): Promise<
    TunnelRequestLog[]
  >;
}

export interface TokenService {
  signAccessToken(payload: AccessTokenPayload): string;
  verifyAccessToken(token: string): AccessTokenPayload;
  generateRefreshToken(): string;
  hashToken(token: string): string;
}

export interface CleanupService {
  sweepStaleLeases(): Promise<void>;
  processQueuedJobs(): Promise<void>;
}
