import { describe, expect, it, vi } from 'vitest';

import { loginCommand } from './login.js';

describe('loginCommand', () => {
  it('prints the auth URL for external forwarding when requested', async () => {
    const startSlackAuth = vi.fn(async () => ({
      authorizeUrl: 'https://slack.example.com/auth',
      state: 'expected-state',
    }));
    const exchangeLoginCode = vi.fn(async () => ({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresInSec: 900,
      profile: {
        email: 'osama@example.com',
        slackUserId: 'U1',
        slackTeamId: 'T1',
      },
    }));
    const waitForCode = vi.fn(async () => ({
      code: 'login-code',
      state: 'expected-state',
    }));
    const close = vi.fn(async () => {});
    const saveSession = vi.fn(async () => {});
    const openUrl = vi.fn(async () => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await loginCommand(
        'osama@example.com',
        { printAuthUrl: true },
        {
          getCliConfig: () => ({ apiBaseUrl: 'https://api.example.com' }),
          createApiClient: () =>
            ({
              startSlackAuth,
              exchangeLoginCode,
            }) as never,
          startCallbackServer: vi.fn(async () => ({
            callbackUrl: 'http://127.0.0.1:7777/callback',
            waitForCode,
            close,
          })),
          createPkcePair: () => ({
            verifier: 'verifier-value',
            challenge: 'challenge-value',
          }),
          openUrl,
          saveSession,
        },
      );
      expect(startSlackAuth).toHaveBeenCalledWith({
        email: 'osama@example.com',
        codeChallenge: 'challenge-value',
        cliCallbackUrl: 'http://127.0.0.1:7777/callback',
      });
      expect(openUrl).not.toHaveBeenCalled();
      expect(waitForCode).toHaveBeenCalledTimes(1);
      expect(exchangeLoginCode).toHaveBeenCalledWith({
        loginCode: 'login-code',
        codeVerifier: 'verifier-value',
      });
      expect(saveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          profile: expect.objectContaining({
            email: 'osama@example.com',
          }),
        }),
      );
      expect(logSpy).toHaveBeenCalledWith('Auth URL: https://slack.example.com/auth');
      expect(logSpy).toHaveBeenCalledWith('Waiting for Slack OAuth callback...');
      expect(logSpy).toHaveBeenCalledWith('Logged in as osama@example.com');
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('opens the browser by default', async () => {
    const openUrl = vi.fn(async () => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await loginCommand(
        'osama@example.com',
        {},
        {
          getCliConfig: () => ({ apiBaseUrl: 'https://api.example.com' }),
          createApiClient: () =>
            ({
              startSlackAuth: vi.fn(async () => ({
                authorizeUrl: 'https://slack.example.com/auth',
                state: 'expected-state',
              })),
              exchangeLoginCode: vi.fn(async () => ({
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                expiresInSec: 900,
                profile: {
                  email: 'osama@example.com',
                  slackUserId: 'U1',
                  slackTeamId: 'T1',
                },
              })),
            }) as never,
          startCallbackServer: vi.fn(async () => ({
            callbackUrl: 'http://127.0.0.1:7777/callback',
            waitForCode: vi.fn(async () => ({
              code: 'login-code',
              state: 'expected-state',
            })),
            close: vi.fn(async () => {}),
          })),
          createPkcePair: () => ({
            verifier: 'verifier-value',
            challenge: 'challenge-value',
          }),
          openUrl,
          saveSession: vi.fn(async () => {}),
        },
      );
      expect(openUrl).toHaveBeenCalledWith('https://slack.example.com/auth');
      expect(logSpy).not.toHaveBeenCalledWith('Auth URL: https://slack.example.com/auth');
    } finally {
      logSpy.mockRestore();
    }
  });
});
