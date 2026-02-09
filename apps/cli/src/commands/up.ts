import { spawn } from 'node:child_process';

import type { StoredSession } from '../types.js';
import { cliConfig } from '../config.js';
import { ApiClient, ApiClientError } from '../lib/api-client.js';
import { ensureCloudflaredInstalled } from '../lib/cloudflared.js';
import { requireSession } from '../lib/session.js';
import { saveSession } from '../store/credentials.js';

async function refreshSession(apiClient: ApiClient, session: StoredSession): Promise<StoredSession> {
  const refreshed = await apiClient.refreshTokens(session.refreshToken);
  const next: StoredSession = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAtEpochSec: Math.floor(Date.now() / 1000) + refreshed.expiresInSec,
    profile: refreshed.profile,
  };
  await saveSession(next);
  return next;
}

async function withTokenRetry<T>(
  apiClient: ApiClient,
  sessionRef: { value: StoredSession },
  run: (accessToken: string) => Promise<T>,
): Promise<T> {
  try {
    return await run(sessionRef.value.accessToken);
  } catch (error) {
    if (!(error instanceof ApiClientError) || error.status !== 401) {
      throw error;
    }

    sessionRef.value = await refreshSession(apiClient, sessionRef.value);
    return run(sessionRef.value.accessToken);
  }
}

export async function upCommand(input: { port: number; url?: string }): Promise<void> {
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error('Port must be an integer between 1 and 65535.');
  }

  const apiClient = new ApiClient(cliConfig.apiBaseUrl);
  const sessionRef = {
    value: await requireSession(apiClient),
  };

  const cloudflaredPath = await ensureCloudflaredInstalled();

  const tunnel = await withTokenRetry(apiClient, sessionRef, (accessToken) =>
    apiClient.createTunnel(accessToken, {
      port: input.port,
      requestedSlug: input.url,
    }),
  );

  console.log(`Tunnel URL: https://${tunnel.hostname}`);

  const child = spawn(
    cloudflaredPath,
    ['tunnel', '--no-autoupdate', 'run', '--token', tunnel.cloudflaredToken],
    {
      stdio: 'inherit',
    },
  );

  let stopping = false;

  const stopRemoteTunnel = async (): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;

    try {
      await withTokenRetry(apiClient, sessionRef, (accessToken) =>
        apiClient.stopTunnel(accessToken, tunnel.tunnelId),
      );
    } catch (error) {
      console.error('Failed to stop tunnel cleanly:', error instanceof Error ? error.message : String(error));
    }
  };

  const heartbeatTimer = setInterval(() => {
    void withTokenRetry(apiClient, sessionRef, (accessToken) =>
      apiClient.heartbeat(accessToken, tunnel.tunnelId),
    ).catch((error) => {
      console.error('Heartbeat failed:', error instanceof Error ? error.message : String(error));
    });
  }, tunnel.heartbeatIntervalSec * 1000);

  const handleSignal = (signal: NodeJS.Signals): void => {
    void (async () => {
      await stopRemoteTunnel();
      child.kill(signal);
    })();
  };

  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 0));
  });

  clearInterval(heartbeatTimer);
  await stopRemoteTunnel();

  process.exit(exitCode);
}
