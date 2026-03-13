import open from 'open';

import { getCliConfig } from '../config.js';
import { ApiClient } from '../lib/api-client.js';
import { createPkcePair } from '../lib/pkce.js';
import { saveSession } from '../store/credentials.js';

export type LoginCommandOptions = {
  skipBrowserOpen?: boolean;
};

const AUTH_POLL_INTERVAL_MS = 2_000;
const AUTH_POLL_TIMEOUT_MS = 120_000;

type LoginApiClient = Pick<ApiClient, 'startSlackAuth' | 'getSlackAuthStatus' | 'exchangeLoginCode'>;

type LoginCommandDependencies = {
  getCliConfig: typeof getCliConfig;
  createApiClient: (baseUrl: string) => LoginApiClient;
  createPkcePair: typeof createPkcePair;
  openUrl: (url: string) => Promise<void>;
  saveSession: typeof saveSession;
  sleep: (ms: number) => Promise<void>;
};

const defaultDependencies: LoginCommandDependencies = {
  getCliConfig,
  createApiClient: (baseUrl: string) => new ApiClient(baseUrl),
  createPkcePair,
  openUrl: async (url: string) => {
    await open(url);
  },
  saveSession,
  sleep: async (ms: number) => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  },
};

export async function loginCommand(
  email: string,
  options: LoginCommandOptions = {},
  dependencies: LoginCommandDependencies = defaultDependencies,
): Promise<void> {
  const config = dependencies.getCliConfig();

  const apiClient = dependencies.createApiClient(config.apiBaseUrl);
  const pkce = dependencies.createPkcePair();

  const auth = await apiClient.startSlackAuth({
    email,
    codeChallenge: pkce.challenge,
  });

  if (options.skipBrowserOpen) {
    console.log(`Slack Auth URL: ${auth.authorizeUrl}`);
  } else {
    try {
      await dependencies.openUrl(auth.authorizeUrl);
    } catch {
      console.log(`Open this URL in your browser:\n${auth.authorizeUrl}`);
    }
  }

  console.log('Waiting for Slack OAuth confirmation...');

  const loginCode = await waitForLoginCode(auth.state, apiClient, dependencies.sleep);

  const tokenPair = await apiClient.exchangeLoginCode({
    loginCode,
    codeVerifier: pkce.verifier,
  });

  await dependencies.saveSession({
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    expiresAtEpochSec: Math.floor(Date.now() / 1000) + tokenPair.expiresInSec,
    profile: tokenPair.profile,
  });

  console.log(`Logged in as ${tokenPair.profile.email}`);
}

async function waitForLoginCode(
  state: string,
  apiClient: LoginApiClient,
  sleep: (ms: number) => Promise<void>,
): Promise<string> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < AUTH_POLL_TIMEOUT_MS) {
    const authStatus = await apiClient.getSlackAuthStatus({ state });

    if (authStatus.status === 'authorized' && authStatus.loginCode) {
      return authStatus.loginCode;
    }

    if (authStatus.status === 'expired') {
      throw new Error('Slack OAuth session expired. Please run rs-tunnel login again.');
    }

    await sleep(AUTH_POLL_INTERVAL_MS);
  }

  throw new Error('Timed out waiting for Slack OAuth confirmation.');
}
