import { getCliConfig } from '../config.js';
import { ApiClient } from '../lib/api-client.js';
import { withAuthenticatedSession } from '../lib/session.js';

export async function stopCommand(tunnelIdentifier: string): Promise<void> {
  if (!tunnelIdentifier) {
    throw new Error('Tunnel identifier is required.');
  }

  const config = getCliConfig();
  const apiClient = new ApiClient(config.apiBaseUrl);

  await withAuthenticatedSession(apiClient, async (session) => {
    await apiClient.stopTunnel(session.accessToken, tunnelIdentifier);
  });

  console.log(`Stopped tunnel ${tunnelIdentifier}`);
}
