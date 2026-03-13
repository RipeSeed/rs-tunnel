import type {
  AdminActivityEvent,
  AdminBootstrapStatus,
  AdminDashboard,
  AdminRole,
  AdminSession,
  AdminTunnelDetailResponse,
  AdminTunnelSummary,
  AdminUserSummary,
  UserProfile,
} from '@ripeseed/shared';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  slackUserId: string;
  slackTeamId: string;
};

export type RuntimeTunnelTokenPayload = {
  scope: 'tunnel:runtime';
  tunnelId: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  profile: UserProfile;
};

export type AuthFlow = 'cli' | 'web';

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

export type AdminUserSession = {
  id: string;
  email: string;
  slackUserId: string;
  slackTeamId: string;
  role: AdminRole;
  roleGrantedAt: string | null;
};

export interface AuthService {
  startSlackAuth(input: { email: string; codeChallenge: string }): Promise<{
    authorizeUrl: string;
    state: string;
  }>;
  startAdminWebSlackAuth(): Promise<{
    authorizeUrl: string;
    state: string;
  }>;
  handleSlackCallback(input: { state: string; code: string }): Promise<{
    mode: 'cli' | 'web';
    redirectUrl?: string;
  }>;
  getSlackAuthStatus(input: { state: string }): Promise<{
    status: 'pending' | 'authorized' | 'expired';
    loginCode?: string;
  }>;
  exchangeLoginCode(input: { loginCode: string; codeVerifier: string }): Promise<TokenPair>;
  exchangeAdminWebLoginCode(input: { loginCode: string }): Promise<TokenPair>;
  refreshTokens(refreshToken: string): Promise<TokenPair>;
  logout(input: { userId?: string; refreshToken?: string }): Promise<void>;
}

export interface TunnelService {
  createTunnel(input: { userId: string; port: number; requestedSlug?: string }): Promise<{
    tunnelId: string;
    hostname: string;
    cloudflaredToken: string;
    tunnelRunToken: string;
    heartbeatIntervalSec: number;
    leaseTimeoutSec: number;
  }>;
  listTunnels(userId: string, options?: { includeInactive?: boolean }): Promise<TunnelSummary[]>;
  heartbeatTunnel(input: { tunnelId: string }): Promise<{ expiresAt: string }>;
  stopTunnel(input: { userId: string; tunnelIdentifier: string }): Promise<void>;
  stopTunnelById(tunnelId: string, reason: string): Promise<void>;
}

export interface TelemetryService {
  ingestRuntimeTelemetry(input: {
    tunnelId: string;
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
  signTunnelRunToken(payload: { tunnelId: string }): string;
  verifyTunnelRunToken(token: string): RuntimeTunnelTokenPayload;
  generateRefreshToken(): string;
  hashToken(token: string): string;
}

export interface CleanupService {
  sweepStaleLeases(): Promise<void>;
  processQueuedJobs(): Promise<void>;
}

export interface AdminService {
  getBootstrapStatus(): Promise<AdminBootstrapStatus>;
  getSession(userId: string): Promise<AdminSession>;
  getDashboard(userId: string): Promise<AdminDashboard>;
  listUsers(userId: string): Promise<AdminUserSummary[]>;
  listTunnels(userId: string): Promise<AdminTunnelSummary[]>;
  getTunnelDetail(input: { userId: string; tunnelId: string }): Promise<AdminTunnelDetailResponse>;
  getTunnelMetrics(input: { userId: string; tunnelId: string; from: Date; to: Date; limit: number }): Promise<
    TunnelMetricsPoint[]
  >;
  getTunnelRequests(input: { userId: string; tunnelId: string; after: Date | null; limit: number }): Promise<
    TunnelRequestLog[]
  >;
  listActivity(input: { userId: string; limit: number }): Promise<AdminActivityEvent[]>;
}
