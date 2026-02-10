import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import type { StoredSession } from '../types.js';
import { cliConfig } from '../config.js';
import { ApiClient, ApiClientError } from '../lib/api-client.js';
import { ensureCloudflaredInstalled } from '../lib/cloudflared.js';
import { startLocalProxy, type LocalProxy } from '../lib/local-proxy.js';
import { requireSession } from '../lib/session.js';
import { TunnelStats } from '../lib/tunnel-stats.js';
import { createUpDashboard, type UpDashboard } from '../lib/up-dashboard.js';
import { getCliVersion } from '../lib/version.js';
import { saveSession } from '../store/credentials.js';

type UpInput = {
  port: number;
  url?: string;
  verbose?: boolean;
};

type UpCommandDependencies = {
  createApiClient: (baseUrl: string) => ApiClient;
  requireSession: (apiClient: ApiClient) => Promise<StoredSession>;
  saveSession: (session: StoredSession) => Promise<void>;
  ensureCloudflaredInstalled: () => Promise<string>;
  startLocalProxy: typeof startLocalProxy;
  createUpDashboard: typeof createUpDashboard;
  getCliVersion: () => string;
  spawn: typeof spawn;
  processRef: {
    once: NodeJS.Process['once'];
    removeListener: NodeJS.Process['removeListener'];
    exit: (code?: number) => never;
    stderr: NodeJS.WriteStream;
  };
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
};

const defaultDependencies: UpCommandDependencies = {
  createApiClient: (baseUrl) => new ApiClient(baseUrl),
  requireSession,
  saveSession,
  ensureCloudflaredInstalled,
  startLocalProxy,
  createUpDashboard,
  getCliVersion,
  spawn,
  processRef: process,
  setInterval,
  clearInterval,
};

async function refreshSession(
  apiClient: ApiClient,
  session: StoredSession,
  saveSessionFn: (session: StoredSession) => Promise<void>,
): Promise<StoredSession> {
  const refreshed = await apiClient.refreshTokens(session.refreshToken);
  const next: StoredSession = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAtEpochSec: Math.floor(Date.now() / 1000) + refreshed.expiresInSec,
    profile: refreshed.profile,
  };
  await saveSessionFn(next);
  return next;
}

async function withTokenRetry<T>(
  apiClient: ApiClient,
  sessionRef: { value: StoredSession },
  saveSessionFn: (session: StoredSession) => Promise<void>,
  run: (accessToken: string) => Promise<T>,
): Promise<T> {
  try {
    return await run(sessionRef.value.accessToken);
  } catch (error) {
    if (!(error instanceof ApiClientError) || error.status !== 401) {
      throw error;
    }

    sessionRef.value = await refreshSession(apiClient, sessionRef.value, saveSessionFn);
    return run(sessionRef.value.accessToken);
  }
}

export function extractRegionFromCloudflaredLine(line: string): string | null {
  const patterns = [/\blocation=([a-z0-9-]+)/i, /\bregion=([a-z0-9-]+)/i, /\bcolo=([a-z0-9-]+)/i];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    return match[1].toUpperCase();
  }

  return null;
}

function attachLineReader(
  stream: NodeJS.ReadableStream | null | undefined,
  onLine: (line: string) => void,
): () => void {
  if (!stream) {
    return () => {};
  }

  const reader = createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  reader.on('line', onLine);
  return () => reader.close();
}

async function stopProxy(proxy: LocalProxy | null): Promise<void> {
  if (!proxy) {
    return;
  }

  try {
    await proxy.stop();
  } catch (error) {
    console.error('Failed to stop local proxy:', error instanceof Error ? error.message : String(error));
  }
}

export async function upCommand(input: UpInput, dependencies: UpCommandDependencies = defaultDependencies): Promise<void> {
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error('Port must be an integer between 1 and 65535.');
  }

  const apiClient = dependencies.createApiClient(cliConfig.apiBaseUrl);
  const sessionRef = {
    value: await dependencies.requireSession(apiClient),
  };

  const cloudflaredPath = await dependencies.ensureCloudflaredInstalled();
  const stats = new TunnelStats();

  let dashboard: UpDashboard | null = null;
  let proxy: LocalProxy | null = null;
  let tunnel: Awaited<ReturnType<ApiClient['createTunnel']>> | null = null;
  let child: ReturnType<typeof spawn> | null = null;
  let closeStdoutReader = () => {};
  let closeStderrReader = () => {};
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let metricsTimer: ReturnType<typeof setInterval> | null = null;
  let stopRemoteTunnelInProgress = false;

  const cloudflaredLogBuffer: string[] = [];

  const rememberCloudflaredLine = (line: string): void => {
    if (line.trim().length === 0) {
      return;
    }

    cloudflaredLogBuffer.push(line);
    if (cloudflaredLogBuffer.length > 80) {
      cloudflaredLogBuffer.shift();
    }
  };

  const stopRemoteTunnel = async (): Promise<void> => {
    if (stopRemoteTunnelInProgress || !tunnel) {
      return;
    }

    stopRemoteTunnelInProgress = true;
    const tunnelId = tunnel.tunnelId;

    try {
      await withTokenRetry(apiClient, sessionRef, dependencies.saveSession, (accessToken) =>
        apiClient.stopTunnel(accessToken, tunnelId),
      );
    } catch (error) {
      console.error('Failed to stop tunnel cleanly:', error instanceof Error ? error.message : String(error));
    }
  };

  const handleCloudflaredLine = (line: string): void => {
    rememberCloudflaredLine(line);

    const region = extractRegionFromCloudflaredLine(line);
    if (region && dashboard) {
      dashboard.setRegion(region);
    }

    if (dashboard && input.verbose) {
      dashboard.addCloudflaredLine(line);
    }
  };

  const handleSignal = (signal: NodeJS.Signals): void => {
    void (async () => {
      await stopRemoteTunnel();
      child?.kill(signal);
    })();
  };

  const onSigInt = (): void => handleSignal('SIGINT');
  const onSigTerm = (): void => handleSignal('SIGTERM');

  try {
    const startedProxy = await dependencies.startLocalProxy({
      targetPort: input.port,
      onRequest: (event) => {
        stats.recordRequest(event);
        dashboard?.addRequest(event);
      },
      onConnectionChange: (connectionSnapshot) => {
        stats.updateConnections(connectionSnapshot);
      },
    });
    proxy = startedProxy;

    tunnel = await withTokenRetry(apiClient, sessionRef, dependencies.saveSession, (accessToken) =>
      apiClient.createTunnel(accessToken, {
        port: startedProxy.port,
        requestedSlug: input.url,
      }),
    );

    const tunnelId = tunnel.tunnelId;

    dashboard = dependencies.createUpDashboard({
      account: sessionRef.value.profile.email,
      version: dependencies.getCliVersion(),
      forwarding: `https://${tunnel.hostname} -> http://localhost:${input.port}`,
      verbose: Boolean(input.verbose),
    });

    dashboard.setMetrics(stats.getSnapshot());

    metricsTimer = dependencies.setInterval(() => {
      dashboard?.setMetrics(stats.getSnapshot());
    }, 1_000);

    child = dependencies.spawn(
      cloudflaredPath,
      ['tunnel', '--no-autoupdate', 'run', '--token', tunnel.cloudflaredToken],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    closeStdoutReader = attachLineReader(child.stdout, handleCloudflaredLine);
    closeStderrReader = attachLineReader(child.stderr, handleCloudflaredLine);

    heartbeatTimer = dependencies.setInterval(() => {
      void withTokenRetry(apiClient, sessionRef, dependencies.saveSession, (accessToken) =>
        apiClient.heartbeat(accessToken, tunnelId),
      ).catch((error) => {
        console.error('Heartbeat failed:', error instanceof Error ? error.message : String(error));
      });
    }, tunnel.heartbeatIntervalSec * 1000);

    dependencies.processRef.once('SIGINT', onSigInt);
    dependencies.processRef.once('SIGTERM', onSigTerm);

    const exitCode = await new Promise<number>((resolve, reject) => {
      child!.once('error', reject);
      child!.once('exit', (code) => resolve(code ?? 0));
    });

    if (exitCode !== 0 && !input.verbose && cloudflaredLogBuffer.length > 0) {
      dependencies.processRef.stderr.write('cloudflared exited unexpectedly. Last logs:\n');
      for (const line of cloudflaredLogBuffer.slice(-10)) {
        dependencies.processRef.stderr.write(`${line}\n`);
      }
    }

    if (heartbeatTimer) {
      dependencies.clearInterval(heartbeatTimer);
    }

    if (metricsTimer) {
      dependencies.clearInterval(metricsTimer);
    }

    closeStdoutReader();
    closeStderrReader();
    dashboard.stop();

    dependencies.processRef.removeListener('SIGINT', onSigInt);
    dependencies.processRef.removeListener('SIGTERM', onSigTerm);

    await stopRemoteTunnel();
    await stopProxy(proxy);

    dependencies.processRef.exit(exitCode);
  } catch (error) {
    if (heartbeatTimer) {
      dependencies.clearInterval(heartbeatTimer);
    }

    if (metricsTimer) {
      dependencies.clearInterval(metricsTimer);
    }

    closeStdoutReader();
    closeStderrReader();
    if (dashboard) {
      dashboard.stop();
    }

    dependencies.processRef.removeListener('SIGINT', onSigInt);
    dependencies.processRef.removeListener('SIGTERM', onSigTerm);

    await stopRemoteTunnel();
    await stopProxy(proxy);

    throw error;
  }
}
