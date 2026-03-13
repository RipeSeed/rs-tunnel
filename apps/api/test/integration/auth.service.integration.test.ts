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
  flow: 'cli' | 'web';
  loginCode?: string;
  userId?: string;
  status: 'pending' | 'authorized' | 'consumed';
  expiresAt: Date;
};

type UserRecord = {
  id: string;
  email: string;
  slackUserId: string;
  slackTeamId: string;
  adminRole: 'member' | 'owner';
  roleGrantedAt: Date | null;
  status: 'active';
  createdAt: Date;
  updatedAt: Date;
};

const env: Env = {
  NODE_ENV: 'test',
  PORT: 8080,
  API_BASE_URL: 'http://localhost:8080',
  ADMIN_WEB_BASE_URL: 'http://localhost:3001',
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
  const users = new Map<string, UserRecord>();

  const repository = {
    createOauthSession: vi.fn(async (input: Omit<Session, 'id' | 'status'>) => {
      const session: Session = {
        id: `session-${sessions.size + 1}`,
        status: 'pending',
        ...input,
      };
      sessions.set(session.state, session);
      return session;
    }),
    getOauthSessionByState: vi.fn(async (state: string) => sessions.get(state)),
    upsertUserBySlack: vi.fn(async (input: { email: string; slackUserId: string; slackTeamId: string }) => {
      const existing = Array.from(users.values()).find((user) => user.email === input.email);
      const user: UserRecord = existing
        ? {
            ...existing,
            slackUserId: input.slackUserId,
            slackTeamId: input.slackTeamId,
            updatedAt: new Date(),
          }
        : {
            id: `user-${users.size + 1}`,
            ...input,
            adminRole: 'member',
            roleGrantedAt: null,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
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
    claimOwnerIfMissing: vi.fn(async (userId: string, roleGrantedAt: Date) => {
      const existingOwner = Array.from(users.values()).find((user) => user.adminRole === 'owner');
      if (existingOwner) {
        return users.get(userId);
      }

      const user = users.get(userId);
      if (!user) {
        return undefined;
      }

      const updated: UserRecord = {
        ...user,
        adminRole: 'owner',
        roleGrantedAt,
      };
      users.set(userId, updated);
      return updated;
    }),
    storeRefreshToken: vi.fn().mockResolvedValue(undefined),
    getActiveRefreshTokenWithUser: vi.fn(),
    revokeRefreshToken: vi.fn(),
    revokeAllUserRefreshTokens: vi.fn(),
    hasOwnerUser: vi.fn(async () => Array.from(users.values()).some((user) => user.adminRole === 'owner')),
    getOwnerUser: vi.fn(async () => Array.from(users.values()).find((user) => user.adminRole === 'owner')),
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
    vi.clearAllMocks();
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

    const callback = await service.handleSlackCallback({
      state: start.state,
      code: 'code-123',
    });

    expect(callback.mode).toBe('cli');

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

  it('lets the first admin-panel login claim ownership even when the user already exists', async () => {
    const existingUser: UserRecord = {
      id: 'user-existing',
      email: 'osama@example.com',
      slackUserId: 'ULEGACY',
      slackTeamId: 'TEXAMPLE',
      adminRole: 'member',
      roleGrantedAt: null,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.set(existingUser.id, existingUser);

    const service = new AuthService(
      env,
      repository as unknown as Repository,
      tokenService as unknown as TokenService,
    );

    const start = await service.startAdminWebSlackAuth();

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

    const callback = await service.handleSlackCallback({
      state: start.state,
      code: 'code-admin',
    });

    expect(callback.mode).toBe('web');
    expect(callback.redirectUrl).toContain('/auth/callback?loginCode=');

    const loginCode = new URL(callback.redirectUrl ?? 'http://localhost:3001').searchParams.get('loginCode') ?? '';
    const exchange = await service.exchangeAdminWebLoginCode({ loginCode });

    expect(exchange.profile.email).toBe('osama@example.com');
    expect(users.get(existingUser.id)?.adminRole).toBe('owner');
  });

  it('denies a second admin-panel user when an owner already exists', async () => {
    users.set('owner-1', {
      id: 'owner-1',
      email: 'owner@example.com',
      slackUserId: 'UOWNER',
      slackTeamId: 'TEXAMPLE',
      adminRole: 'owner',
      roleGrantedAt: new Date(),
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const service = new AuthService(
      env,
      repository as unknown as Repository,
      tokenService as unknown as TokenService,
    );

    const start = await service.startAdminWebSlackAuth();

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
            email: 'member@example.com',
            'https://slack.com/user_id': 'UMEMBER',
            'https://slack.com/team_id': 'TEXAMPLE',
          }),
        }),
    );

    const callback = await service.handleSlackCallback({
      state: start.state,
      code: 'code-admin-2',
    });

    const loginCode = new URL(callback.redirectUrl ?? 'http://localhost:3001').searchParams.get('loginCode') ?? '';

    await expect(service.exchangeAdminWebLoginCode({ loginCode })).rejects.toThrowError(/Only the instance owner/);
  });
});
