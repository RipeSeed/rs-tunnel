import { cliConfig } from '../config.js';
import { ApiClient } from '../lib/api-client.js';
import { clearSession, loadSession } from '../store/credentials.js';

export async function logoutCommand(): Promise<void> {
  const apiClient = new ApiClient(cliConfig.apiBaseUrl);
  const session = await loadSession();

  if (session) {
    try {
      await apiClient.logout(session.accessToken, session.refreshToken);
    } catch {
      // Session cleanup should continue even if remote revocation fails.
    }
  }

  await clearSession();
  console.log('Logged out.');
}
