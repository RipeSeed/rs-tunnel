import os from 'node:os';

import { cliConfig } from '../config.js';
import { ApiClient } from '../lib/api-client.js';
import { findCloudflaredBinary, getCloudflaredVersion } from '../lib/cloudflared.js';
import { loadSession } from '../store/credentials.js';

export async function doctorCommand(): Promise<void> {
  const apiClient = new ApiClient(cliConfig.apiBaseUrl);

  const platform = `${os.platform()} ${os.arch()}`;
  const osSupported = ['darwin', 'linux', 'win32'].includes(os.platform());

  const apiHealthy = await apiClient.health();
  const session = await loadSession();
  const cloudflared = await findCloudflaredBinary();
  const cloudflaredVersion = cloudflared ? getCloudflaredVersion(cloudflared) : null;

  console.log(`OS: ${platform} (${osSupported ? 'supported' : 'unsupported'})`);
  console.log(`API (${cliConfig.apiBaseUrl}): ${apiHealthy ? 'reachable' : 'unreachable'}`);
  console.log(`Auth session: ${session ? `present (${session.profile.email})` : 'missing'}`);
  console.log(
    `cloudflared: ${cloudflared ? `found at ${cloudflared}${cloudflaredVersion ? ` (${cloudflaredVersion})` : ''}` : 'not found'}`,
  );
}
