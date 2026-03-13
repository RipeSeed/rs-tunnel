import open from 'open';

import { getCliConfig } from '../config.js';
import { ApiClient } from '../lib/api-client.js';
import { startCallbackServer } from '../lib/local-callback.js';
import { createPkcePair } from '../lib/pkce.js';
import { saveSession } from '../store/credentials.js';

export type LoginCommandOptions = {
  printAuthUrl?: boolean;
};

type LoginApiClient = Pick<ApiClient, 'startSlackAuth' | 'exchangeLoginCode'>;

type LoginCommandDependencies = {
  getCliConfig: typeof getCliConfig;
  createApiClient: (baseUrl: string) => LoginApiClient;
  startCallbackServer: typeof startCallbackServer;
  createPkcePair: typeof createPkcePair;
  openUrl: (url: string) => Promise<void>;
  saveSession: typeof saveSession;
};

const defaultDependencies: LoginCommandDependencies = {
  getCliConfig,
  createApiClient: (baseUrl: string) => new ApiClient(baseUrl),
  startCallbackServer,
  createPkcePair,
  openUrl: async (url: string) => {
    await open(url);
  },
  saveSession,
};

export async function loginCommand(
  email: string,
  options: LoginCommandOptions = {},
  dependencies: LoginCommandDependencies = defaultDependencies,
): Promise<void> {
  const config = dependencies.getCliConfig();

  const apiClient = dependencies.createApiClient(config.apiBaseUrl);
  const callbackServer = await dependencies.startCallbackServer();
  const pkce = dependencies.createPkcePair();

  try {
    const auth = await apiClient.startSlackAuth({
      email,
      codeChallenge: pkce.challenge,
      cliCallbackUrl: callbackServer.callbackUrl,
    });

    if (options.printAuthUrl) {
      console.log(`Slack Auth URL: ${auth.authorizeUrl}`);
    } else {
      try {
        await dependencies.openUrl(auth.authorizeUrl);
      } catch {
        console.log(`Open this URL in your browser:\n${auth.authorizeUrl}`);
      }
    }

    console.log('Waiting for Slack OAuth callback...');

    const callback = await callbackServer.waitForCode();

    if (callback.state !== auth.state) {
      throw new Error('OAuth state mismatch. Aborting login.');
    }

    const tokenPair = await apiClient.exchangeLoginCode({
      loginCode: callback.code,
      codeVerifier: pkce.verifier,
    });

    await dependencies.saveSession({
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresAtEpochSec: Math.floor(Date.now() / 1000) + tokenPair.expiresInSec,
      profile: tokenPair.profile,
    });

    console.log(`Logged in as ${tokenPair.profile.email}`);
  } finally {
    await callbackServer.close();
  }
}
