import open from 'open';

import { getCliConfig } from '../config.js';
import { ApiClient } from '../lib/api-client.js';
import { startCallbackServer } from '../lib/local-callback.js';
import { createPkcePair } from '../lib/pkce.js';
import { saveSession } from '../store/credentials.js';

export async function loginCommand(email: string): Promise<void> {
  const config = getCliConfig();

  const apiClient = new ApiClient(config.apiBaseUrl);
  const callbackServer = await startCallbackServer();
  const pkce = createPkcePair();

  try {
    const auth = await apiClient.startSlackAuth({
      email,
      codeChallenge: pkce.challenge,
      cliCallbackUrl: callbackServer.callbackUrl,
    });

    try {
      await open(auth.authorizeUrl);
    } catch {
      console.log(`Open this URL in your browser:\n${auth.authorizeUrl}`);
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

    await saveSession({
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
