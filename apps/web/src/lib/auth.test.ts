import { describe, expect, it } from 'vitest';

import { ApiRequestError } from './api';
import { resolveProtectedAdminState } from './auth';

const browserSession = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  profile: {
    email: 'owner@example.com',
    slackUserId: 'U1',
    slackTeamId: 'T1',
  },
};

describe('resolveProtectedAdminState', () => {
  it('redirects to login when there is no browser session', async () => {
    const result = await resolveProtectedAdminState(null);
    expect(result).toEqual({ kind: 'redirect', location: '/login' });
  });

  it('redirects to access-denied for owner-only failures', async () => {
    const result = await resolveProtectedAdminState(browserSession, async () => {
      throw new ApiRequestError(403, 'OWNER_ACCESS_REQUIRED', 'denied');
    });

    expect(result).toEqual({ kind: 'redirect', location: '/access-denied' });
  });

  it('returns the authorized admin session when the API accepts the access token', async () => {
    const result = await resolveProtectedAdminState(browserSession, async () => ({
      user: {
        id: 'owner-1',
        email: 'owner@example.com',
        slackUserId: 'U1',
        slackTeamId: 'T1',
        role: 'owner',
        roleGrantedAt: '2026-01-01T00:00:00.000Z',
      },
    }));

    expect(result.kind).toBe('authorized');
    if (result.kind === 'authorized') {
      expect(result.adminSession.user.role).toBe('owner');
    }
  });
});
