import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const exchangeAdminLoginCode = vi.fn();
const createAdminBrowserSession = vi.fn();
const encryptAdminBrowserSession = vi.fn();
const getWebEnv = vi.fn(() => ({
  NODE_ENV: 'test' as const,
  RS_TUNNEL_API_URL: 'http://api.test',
  ADMIN_SESSION_SECRET: 'session-secret',
}));

class MockApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

vi.mock('../../../lib/api', () => ({
  ApiRequestError: MockApiRequestError,
  exchangeAdminLoginCode,
}));

vi.mock('../../../lib/env', () => ({
  getWebEnv,
}));

vi.mock('../../../lib/session', () => ({
  ADMIN_SESSION_COOKIE_NAME: 'rs_tunnel_admin_session',
  createAdminBrowserSession,
  encryptAdminBrowserSession,
  getAdminSessionCookieOptions: vi.fn(() => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
  })),
}));

describe('admin auth callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createAdminBrowserSession.mockImplementation((tokenPair) => ({
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresAt: '2026-03-13T00:00:00.000Z',
      profile: tokenPair.profile,
    }));
    encryptAdminBrowserSession.mockResolvedValue('encrypted-session');
  });

  it('redirects back to login when the callback omits a login code', async () => {
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/auth/callback'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login?error=missing-login-code');
  });

  it('exchanges the login code and stores the encrypted browser session cookie', async () => {
    exchangeAdminLoginCode.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresInSec: 900,
      profile: {
        email: 'owner@example.com',
        slackUserId: 'U1',
        slackTeamId: 'T1',
      },
    });

    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/auth/callback?loginCode=login-code'));

    expect(exchangeAdminLoginCode).toHaveBeenCalledWith('login-code');
    expect(encryptAdminBrowserSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
      'session-secret',
    );
    expect(response.headers.get('location')).toBe('http://localhost/');
    expect(response.cookies.get('rs_tunnel_admin_session')?.value).toBe('encrypted-session');
  });

  it('redirects to access denied when the API rejects a non-owner login', async () => {
    exchangeAdminLoginCode.mockRejectedValue(new MockApiRequestError(403, 'OWNER_ACCESS_REQUIRED', 'denied'));

    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/auth/callback?loginCode=login-code'));

    expect(response.headers.get('location')).toBe('http://localhost/access-denied');
    expect(response.cookies.get('rs_tunnel_admin_session')?.value).toBe('');
  });
});
