import { describe, expect, it, vi } from 'vitest';

import { loginCommand } from './login.js';

type LoginDependencies = NonNullable<Parameters<typeof loginCommand>[2]>;

describe('loginCommand', () => {
  it('prints the auth URL when browser auto-open is skipped', async () => {
    const startSlackAuth = vi.fn(async () => ({
      authorizeUrl: 'https://slack.example.com/auth',
      state: 'expected-state',
    }));
    const getSlackAuthStatus = vi.fn(async () => ({
      status: 'authorized' as const,
      loginCode: 'login-code',
    }));
    const exchangeLoginCode = vi.fn(async () => ({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresInSec: 900,
      profile: {
        email: 'test@example.com',
        slackUserId: 'U1',
        slackTeamId: 'T1',
      },
    }));
    const saveSession = vi.fn(async () => {});
    const openUrl = vi.fn(async () => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const dependencies: LoginDependencies = {
      getCliConfig: () => ({ apiBaseUrl: 'https://api.example.com' }),
      createApiClient: () => ({
        startSlackAuth,
        getSlackAuthStatus,
        exchangeLoginCode,
      }),
      createPkcePair: () => ({
        verifier: 'verifier-value',
        challenge: 'challenge-value',
      }),
      openUrl,
      saveSession,
      sleep: vi.fn(async () => {}),
    };

    try {
      await loginCommand('test@example.com', { skipBrowserOpen: true }, dependencies);
      expect(startSlackAuth).toHaveBeenCalledWith({
        email: 'test@example.com',
        codeChallenge: 'challenge-value',
      });
      expect(openUrl).not.toHaveBeenCalled();
      expect(getSlackAuthStatus).toHaveBeenCalledWith({
        state: 'expected-state',
      });
      expect(exchangeLoginCode).toHaveBeenCalledWith({
        loginCode: 'login-code',
        codeVerifier: 'verifier-value',
      });
      expect(saveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          profile: expect.objectContaining({
            email: 'test@example.com',
          }),
        }),
      );
      expect(logSpy).toHaveBeenCalledWith('Slack Auth URL: https://slack.example.com/auth');
      expect(logSpy).toHaveBeenCalledWith('Waiting for Slack OAuth confirmation...');
      expect(logSpy).toHaveBeenCalledWith('Logged in as test@example.com');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('opens the browser by default', async () => {
    const openUrl = vi.fn(async () => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const dependencies: LoginDependencies = {
      getCliConfig: () => ({ apiBaseUrl: 'https://api.example.com' }),
      createApiClient: () => ({
        startSlackAuth: vi.fn(async () => ({
          authorizeUrl: 'https://slack.example.com/auth',
          state: 'expected-state',
        })),
        getSlackAuthStatus: vi.fn(async () => ({
          status: 'authorized' as const,
          loginCode: 'login-code',
        })),
        exchangeLoginCode: vi.fn(async () => ({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresInSec: 900,
          profile: {
            email: 'test@example.com',
            slackUserId: 'U1',
            slackTeamId: 'T1',
          },
        })),
      }),
      createPkcePair: () => ({
        verifier: 'verifier-value',
        challenge: 'challenge-value',
      }),
      openUrl,
      saveSession: vi.fn(async () => {}),
      sleep: vi.fn(async () => {}),
    };

    try {
      await loginCommand('test@example.com', {}, dependencies);
      expect(openUrl).toHaveBeenCalledWith('https://slack.example.com/auth');
      expect(logSpy).not.toHaveBeenCalledWith('Slack Auth URL: https://slack.example.com/auth');
    } finally {
      logSpy.mockRestore();
    }
  });
});
