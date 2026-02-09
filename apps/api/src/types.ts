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

export type TunnelSummary = {
  id: string;
  hostname: string;
  slug: string;
  status: string;
  requestedPort: number;
  createdAt: string;
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
  listTunnels(userId: string): Promise<TunnelSummary[]>;
  heartbeat(input: { userId: string; tunnelIdentifier: string }): Promise<{ expiresAt: string }>;
  stopTunnel(input: { userId: string; tunnelIdentifier: string }): Promise<void>;
  stopTunnelById(tunnelId: string, reason: string): Promise<void>;
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
