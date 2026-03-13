import { describe, expect, it } from 'vitest';

import {
  createAdminBrowserSession,
  decryptAdminBrowserSession,
  encryptAdminBrowserSession,
  isSessionExpiring,
} from './session';

describe('admin browser session helpers', () => {
  it('round-trips encrypted sessions', async () => {
    const session = createAdminBrowserSession({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresInSec: 900,
      profile: {
        email: 'owner@example.com',
        slackUserId: 'U1',
        slackTeamId: 'T1',
      },
    });

    const encrypted = await encryptAdminBrowserSession(session, 'test-session-secret');
    const decrypted = await decryptAdminBrowserSession(encrypted, 'test-session-secret');

    expect(decrypted).toEqual(session);
  });

  it('detects sessions that are about to expire', () => {
    expect(
      isSessionExpiring({
        accessToken: 'a',
        refreshToken: 'b',
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        profile: {
          email: 'owner@example.com',
          slackUserId: 'U1',
          slackTeamId: 'T1',
        },
      }),
    ).toBe(true);
  });
});
