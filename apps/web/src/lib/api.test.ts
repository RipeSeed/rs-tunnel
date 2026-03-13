import { describe, expect, it, vi } from 'vitest';

import { ApiRequestError, requestWithRefresh } from './api';

describe('requestWithRefresh', () => {
  it('retries once after a 401 by refreshing the session', async () => {
    const request = vi
      .fn<(accessToken: string) => Promise<string>>()
      .mockRejectedValueOnce(new ApiRequestError(401, 'INVALID_TOKEN', 'expired'))
      .mockResolvedValueOnce('ok');
    const refresh = vi.fn(async () => ({
      accessToken: 'next-access',
      refreshToken: 'next-refresh',
      expiresInSec: 900,
      profile: {
        email: 'owner@example.com',
        slackUserId: 'U1',
        slackTeamId: 'T1',
      },
    }));

    const result = await requestWithRefresh({
      session: {
        accessToken: 'expired-access',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
        profile: {
          email: 'owner@example.com',
          slackUserId: 'U1',
          slackTeamId: 'T1',
        },
      },
      request,
      refresh,
    });

    expect(refresh).toHaveBeenCalledWith('refresh-token');
    expect(request).toHaveBeenNthCalledWith(2, 'next-access');
    expect(result.data).toBe('ok');
    expect(result.session.accessToken).toBe('next-access');
  });
});
