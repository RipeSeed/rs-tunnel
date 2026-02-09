import { cliConfig } from '../config.js';
import { ApiClient } from '../lib/api-client.js';
import { withAuthenticatedSession } from '../lib/session.js';

export async function listCommand(): Promise<void> {
  const apiClient = new ApiClient(cliConfig.apiBaseUrl);

  await withAuthenticatedSession(apiClient, async (session) => {
    const tunnels = await apiClient.listTunnels(session.accessToken);

    if (tunnels.length === 0) {
      console.log('No active tunnels.');
      return;
    }

    for (const tunnel of tunnels) {
      console.log(
        `${tunnel.id} | ${tunnel.hostname} | status=${tunnel.status} | port=${tunnel.requestedPort} | created=${tunnel.createdAt}`,
      );
    }
  });
}
