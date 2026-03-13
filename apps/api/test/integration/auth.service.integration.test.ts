import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { AppError } from '../../src/lib/app-error.js';
import { AuthService } from '../../src/services/auth.service.js';
import type { Env } from '../../src/config/env.js';
import type { Repository } from '../../src/db/repository.js';
import type { TokenService } from '../../src/services/token.service.js';
import { createCodeChallenge } from '../../src/utils/pkce.js';

type Session = {
  id: string;
  email: string;
  state: string;
  codeChallenge: string;
  cliCallbackUrl: string;
  loginCode?: string;
  userId?: string;
  status: 'pending' | 'authorized' | 'consumed';
  expiresAt: Date;
};

const env: Env = {
  NODE_ENV: 'test',
  PORT: 8080,
  API_BASE_URL: 'http://localhost:8080',
  DATABASE_URL: 'postgres://x',
  JWT_SECRET: '1234567890123456',
  REFRESH_TOKEN_SECRET: '1234567890123456',
  JWT_ACCESS_TTL_MINUTES: 15,
  REFRESH_TTL_DAYS: 30,
  SLACK_CLIENT_ID: 'client',
  SLACK_CLIENT_SECRET: 'secret',
  SLACK_REDIRECT_URI: 'http://localhost:8080/v1/auth/slack/callback',
  ALLOWED_EMAIL_DOMAIN: '@example.com',
  ALLOWED_SLACK_TEAM_ID: 'TEXAMPLE',
  CLOUDFLARE_ACCOUNT_ID: 'A1',
  CLOUDFLARE_ZONE_ID: 'Z1',
  CLOUDFLARE_API_TOKEN: 'token',
  CLOUDFLARE_BASE_DOMAIN: 'tunnel.example.com',
  MAX_ACTIVE_TUNNELS: 5,
  HEARTBEAT_INTERVAL_SEC: 20,
  LEASE_TIMEOUT_SEC: 60,
  REAPER_INTERVAL_SEC: 30,
};

describe('AuthService integration behaviors', () => {
  const sessions = new Map<string, Session>();
  const users = new Map<string, { id: string; email: string; slackUserId: string; slackTeamId: string }>();

  const repository = {
    createOauthSession: vi.fn(async (input: Omit<Session, 'id' | 'status'>) => {
      const session: Session = {
        id: 'session-1',
        status: 'pending',
        ...input,
      };
      sessions.set(session.state, session);
      return session;
    }),
    getOauthSessionByState: vi.fn(async (state: string) => sessions.get(state)),
    upsertUserBySlack: vi.fn(async (input: { email: string; slackUserId: string; slackTeamId: string }) => {
      const user = {
        id: 'user-1',
        ...input,
      };
      users.set(user.id, user);
      return user;
    }),
    authorizeOauthSession: vi.fn(async (input: { sessionId: string; userId: string; loginCode: string }) => {
      for (const session of sessions.values()) {
        if (session.id === input.sessionId) {
          session.userId = input.userId;
          session.loginCode = input.loginCode;
          session.status = 'authorized';
        }
      }
    }),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
    getOauthSessionByLoginCode: vi.fn(async (loginCode: string) => {
      for (const session of sessions.values()) {
        if (session.loginCode === loginCode) {
          return session;
        }
      }
      return undefined;
    }),
    getUserById: vi.fn(async (id: string) => users.get(id)),
    consumeOauthSession: vi.fn(async (sessionId: string) => {
      for (const session of sessions.values()) {
        if (session.id === sessionId) {
          session.status = 'consumed';
        }
      }
    }),
    storeRefreshToken: vi.fn().mockResolvedValue(undefined),
    getActiveRefreshTokenWithUser: vi.fn(),
    revokeRefreshToken: vi.fn(),
    revokeAllUserRefreshTokens: vi.fn(),
  };

  const tokenService = {
    signAccessToken: vi.fn(() => 'access-token'),
    verifyAccessToken: vi.fn(),
    generateRefreshToken: vi.fn(() => 'refresh-token'),
    hashToken: vi.fn(() => 'hash'),
  };

  beforeEach(() => {
    sessions.clear();
    users.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('allows Slack login success for allowed email domain in the configured workspace', async () => {
    const service = new AuthService(
      env,
      repository as unknown as Repository,
      tokenService as unknown as TokenService,
    );
    const verifier = 'verifier-1234567890';
    const codeChallenge = createCodeChallenge(verifier);

    const start = await service.startSlackAuth({
      email: 'osama@example.com',
      codeChallenge,
    });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, access_token: 'slack-access-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            email: 'osama@example.com',
            'https://slack.com/user_id': 'U1',
            'https://slack.com/team_id': 'TEXAMPLE',
          }),
        }),
    );

    await service.handleSlackCallback({
      state: start.state,
      code: 'code-123',
    });

    const authStatus = await service.getSlackAuthStatus({ state: start.state });
    expect(authStatus.status).toBe('authorized');
    expect(authStatus.loginCode).toBeTruthy();

    const exchange = await service.exchangeLoginCode({
      loginCode: authStatus.loginCode ?? '',
      codeVerifier: verifier,
    });

    expect(exchange.profile.email).toBe('osama@example.com');
    expect(exchange.accessToken).toBe('access-token');
    expect(exchange.refreshToken).toBe('refresh-token');
  });

  it('denies emails outside the allowed domain during login start', async () => {
    const service = new AuthService(
      env,
      repository as unknown as Repository,
      tokenService as unknown as TokenService,
    );

    await expect(
      service.startSlackAuth({
        email: 'user@gmail.com',
        codeChallenge: 'challenge-123',
      }),
    ).rejects.toThrowError(AppError);
  });

  it('denies users from a different Slack workspace', async () => {
    const service = new AuthService(
      env,
      repository as unknown as Repository,
      tokenService as unknown as TokenService,
    );
    const verifier = 'verifier-1234567890';
    const codeChallenge = createCodeChallenge(verifier);

    const start = await service.startSlackAuth({
      email: 'osama@example.com',
      codeChallenge,
    });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, access_token: 'slack-access-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            email: 'osama@example.com',
            'https://slack.com/user_id': 'U1',
            'https://slack.com/team_id': 'TOTHER',
          }),
        }),
    );

    await expect(service.handleSlackCallback({ state: start.state, code: 'code-123' })).rejects.toThrowError(
      /workspace is not allowed/,
    );
  });
});
