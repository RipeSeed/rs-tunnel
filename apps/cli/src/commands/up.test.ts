import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { upCommand } from './up.js';
import { ApiClientError } from '../lib/api-client.js';

function createFakeChildProcess(): EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };

  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn(() => true);

  return child;
}

function createProcessRef() {
  const listeners = new Map<string, () => void>();

  const processRef = {
    once: vi.fn((event: string, handler: () => void) => {
      listeners.set(event, handler);
      return processRef;
    }),
    removeListener: vi.fn((event: string, handler: () => void) => {
      if (listeners.get(event) === handler) {
        listeners.delete(event);
      }
      return processRef;
    }),
    exit: vi.fn(),
    stderr: {
      write: vi.fn(),
    },
  };

  return {
    processRef,
    listeners,
  };
}

describe('upCommand', () => {
  it('ships telemetry with sanitized paths', async () => {
    const child = createFakeChildProcess();
    const proxyStop = vi.fn(async () => {});
    const dashboard = {
      setRegion: vi.fn(),
      setMetrics: vi.fn(),
      addRequest: vi.fn(),
      addCloudflaredLine: vi.fn(),
      addMessage: vi.fn(),
      stop: vi.fn(),
    };

    const apiClient = {
      refreshTokens: vi.fn(),
      createTunnel: vi.fn(async () => ({
        tunnelId: 'tunnel-id',
        hostname: 'demo.tunnel.example.com',
        cloudflaredToken: 'cf-token',
        tunnelRunToken: 'run-token',
        heartbeatIntervalSec: 20 as const,
        leaseTimeoutSec: 60,
      })),
      stopTunnel: vi.fn(async () => {}),
      heartbeat: vi.fn(async () => ({ expiresAt: '2026-01-01T00:00:00.000Z' })),
      ingestTelemetry: vi.fn(async () => {}),
    };

    const { processRef } = createProcessRef();

    let proxyInput: Parameters<typeof import('../lib/local-proxy.js').startLocalProxy>[0] | undefined;

    const startLocalProxy = vi.fn(async (input: Parameters<typeof import('../lib/local-proxy.js').startLocalProxy>[0]) => {
      proxyInput = input;
      return {
        port: 4545,
        stop: proxyStop,
      };
    });

    const intervalCallbacks: Array<{ ms: number; fn: () => void }> = [];
    const setIntervalFn = vi.fn((fn: () => void, ms: number) => {
      intervalCallbacks.push({ fn, ms });
      return intervalCallbacks.length as unknown as NodeJS.Timeout;
    });

    const runPromise = upCommand(
      { port: 3000, url: 'demo', verbose: false },
      {
        createApiClient: () => apiClient as never,
        requireSession: vi.fn(async () => ({
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresAtEpochSec: 1,
          profile: {
            email: 'osama@example.com',
            slackUserId: 'U1',
            slackTeamId: 'TRIPESEED',
          },
        })),
        saveSession: vi.fn(async () => {}),
        ensureCloudflaredInstalled: vi.fn(async () => '/usr/local/bin/cloudflared'),
        startLocalProxy,
        createUpDashboard: vi.fn(() => dashboard),
        getCliVersion: vi.fn(() => '0.1.0'),
        spawn: vi.fn(() => child) as never,
        processRef: processRef as never,
        setInterval: setIntervalFn as never,
        clearInterval: vi.fn(),
      },
    );

    await new Promise<void>((resolve) => setImmediate(resolve));

    if (!proxyInput?.onRequest) {
      throw new Error('Expected onRequest callback to be registered.');
    }

    proxyInput.onRequest({
      startedAtEpochMs: 1700000000000,
      method: 'GET',
      path: '/foo/bar?token=secret',
      statusCode: 200,
      statusMessage: 'OK',
      durationMs: 12.3,
      responseBytes: 42,
      error: false,
      protocol: 'http',
    });

    const telemetryInterval = intervalCallbacks.find((interval) => interval.ms === 2000);
    if (!telemetryInterval) {
      throw new Error('Expected telemetry interval to be registered.');
    }

    telemetryInterval.fn();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(apiClient.ingestTelemetry).toHaveBeenCalledTimes(1);
    const payload = (apiClient.ingestTelemetry as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as {
      metrics: { requests: number; bytes: number; errors: number };
      requests: Array<{ path: string }>;
    };

    expect(payload.metrics.requests).toBe(1);
    expect(payload.metrics.errors).toBe(0);
    expect(payload.metrics.bytes).toBe(42);
    expect(payload.requests[0]?.path).toBe('/foo/bar');

    child.emit('exit', 0);
    await runPromise;
  });

  it('disables telemetry when server does not support it', async () => {
    const child = createFakeChildProcess();
    const dashboard = {
      setRegion: vi.fn(),
      setMetrics: vi.fn(),
      addRequest: vi.fn(),
      addCloudflaredLine: vi.fn(),
      addMessage: vi.fn(),
      stop: vi.fn(),
    };

    const apiClient = {
      refreshTokens: vi.fn(),
      createTunnel: vi.fn(async () => ({
        tunnelId: 'tunnel-id',
        hostname: 'demo.tunnel.example.com',
        cloudflaredToken: 'cf-token',
        tunnelRunToken: 'run-token',
        heartbeatIntervalSec: 20 as const,
        leaseTimeoutSec: 60,
      })),
      stopTunnel: vi.fn(async () => {}),
      heartbeat: vi.fn(async () => ({ expiresAt: '2026-01-01T00:00:00.000Z' })),
      ingestTelemetry: vi.fn(async () => {
        throw new ApiClientError(404, 'NOT_FOUND', 'missing');
      }),
    };

    const { processRef } = createProcessRef();

    const intervalCallbacks: Array<{ ms: number; fn: () => void }> = [];
    const setIntervalFn = vi.fn((fn: () => void, ms: number) => {
      intervalCallbacks.push({ fn, ms });
      return intervalCallbacks.length as unknown as NodeJS.Timeout;
    });

    const clearIntervalFn = vi.fn();

    const runPromise = upCommand(
      { port: 3000, url: 'demo', verbose: false },
      {
        createApiClient: () => apiClient as never,
        requireSession: vi.fn(async () => ({
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresAtEpochSec: 1,
          profile: {
            email: 'osama@example.com',
            slackUserId: 'U1',
            slackTeamId: 'TRIPESEED',
          },
        })),
        saveSession: vi.fn(async () => {}),
        ensureCloudflaredInstalled: vi.fn(async () => '/usr/local/bin/cloudflared'),
        startLocalProxy: vi.fn(async () => ({
          port: 4545,
          stop: vi.fn(async () => {}),
        })),
        createUpDashboard: vi.fn(() => dashboard),
        getCliVersion: vi.fn(() => '0.1.0'),
        spawn: vi.fn(() => child) as never,
        processRef: processRef as never,
        setInterval: setIntervalFn as never,
        clearInterval: clearIntervalFn as never,
      },
    );

    await new Promise<void>((resolve) => setImmediate(resolve));

    const telemetryInterval = intervalCallbacks.find((interval) => interval.ms === 2000);
    if (!telemetryInterval) {
      throw new Error('Expected telemetry interval to be registered.');
    }

    telemetryInterval.fn();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(clearIntervalFn).toHaveBeenCalled();
    expect(dashboard.addMessage).toHaveBeenCalledWith(expect.stringMatching(/telemetry disabled/i));

    child.emit('exit', 0);
    await runPromise;
  });

  it('prints heartbeat API status and code when heartbeat fails', async () => {
    const child = createFakeChildProcess();
    const dashboard = {
      setRegion: vi.fn(),
      setMetrics: vi.fn(),
      addRequest: vi.fn(),
      addCloudflaredLine: vi.fn(),
      addMessage: vi.fn(),
      stop: vi.fn(),
    };

    const apiClient = {
      refreshTokens: vi.fn(),
      createTunnel: vi.fn(async () => ({
        tunnelId: 'tunnel-id',
        hostname: 'demo.tunnel.example.com',
        cloudflaredToken: 'cf-token',
        tunnelRunToken: 'run-token',
        heartbeatIntervalSec: 20 as const,
        leaseTimeoutSec: 60,
      })),
      stopTunnel: vi.fn(async () => {}),
      heartbeat: vi.fn(async () => {
        throw new ApiClientError(500, 'INTERNAL_ERROR', 'Unexpected server error');
      }),
      ingestTelemetry: vi.fn(async () => {}),
    };

    const { processRef } = createProcessRef();

    const intervalCallbacks: Array<{ ms: number; fn: () => void }> = [];
    const setIntervalFn = vi.fn((fn: () => void, ms: number) => {
      intervalCallbacks.push({ fn, ms });
      return intervalCallbacks.length as unknown as NodeJS.Timeout;
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const runPromise = upCommand(
      { port: 3000, url: 'demo', verbose: false },
      {
        createApiClient: () => apiClient as never,
        requireSession: vi.fn(async () => ({
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresAtEpochSec: 1,
          profile: {
            email: 'osama@example.com',
            slackUserId: 'U1',
            slackTeamId: 'TRIPESEED',
          },
        })),
        saveSession: vi.fn(async () => {}),
        ensureCloudflaredInstalled: vi.fn(async () => '/usr/local/bin/cloudflared'),
        startLocalProxy: vi.fn(async () => ({
          port: 4545,
          stop: vi.fn(async () => {}),
        })),
        createUpDashboard: vi.fn(() => dashboard),
        getCliVersion: vi.fn(() => '0.1.0'),
        spawn: vi.fn(() => child) as never,
        processRef: processRef as never,
        setInterval: setIntervalFn as never,
        clearInterval: vi.fn(),
      },
    );

    await new Promise<void>((resolve) => setImmediate(resolve));

    const heartbeatInterval = intervalCallbacks.find((interval) => interval.ms === 20_000);
    if (!heartbeatInterval) {
      throw new Error('Expected heartbeat interval to be registered.');
    }

    heartbeatInterval.fn();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(apiClient.heartbeat).toHaveBeenCalledWith('run-token', 'tunnel-id');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Heartbeat failed (status=500, code=INTERNAL_ERROR): Unexpected server error'),
    );

    errorSpy.mockRestore();
    child.emit('exit', 0);
    await runPromise;
  });

  it('creates tunnel using local proxy port and initializes dashboard fields', async () => {
    const child = createFakeChildProcess();
    const proxyStop = vi.fn(async () => {});
    const dashboard = {
      setRegion: vi.fn(),
      setMetrics: vi.fn(),
      addRequest: vi.fn(),
      addCloudflaredLine: vi.fn(),
      addMessage: vi.fn(),
      stop: vi.fn(),
    };

    const apiClient = {
      refreshTokens: vi.fn(),
      createTunnel: vi.fn(async () => ({
        tunnelId: 'tunnel-id',
        hostname: 'demo.tunnel.example.com',
        cloudflaredToken: 'cf-token',
        tunnelRunToken: 'run-token',
        heartbeatIntervalSec: 20 as const,
        leaseTimeoutSec: 60,
      })),
      stopTunnel: vi.fn(async () => {}),
      heartbeat: vi.fn(async () => ({ expiresAt: '2026-01-01T00:00:00.000Z' })),
    };

    const { processRef } = createProcessRef();

    const startLocalProxy = vi.fn(async () => ({
      port: 4545,
      stop: proxyStop,
    }));
    const createUpDashboard = vi.fn(() => dashboard);

    const spawnFn = vi.fn(() => {
      setImmediate(() => {
        child.emit('exit', 0);
      });
      return child;
    });

    await upCommand(
      { port: 3000, url: 'demo', verbose: false },
      {
        createApiClient: () => apiClient as never,
        requireSession: vi.fn(async () => ({
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresAtEpochSec: 1,
          profile: {
            email: 'osama@example.com',
            slackUserId: 'U1',
            slackTeamId: 'TRIPESEED',
          },
        })),
        saveSession: vi.fn(async () => {}),
        ensureCloudflaredInstalled: vi.fn(async () => '/usr/local/bin/cloudflared'),
        startLocalProxy,
        createUpDashboard,
        getCliVersion: vi.fn(() => '0.1.0'),
        spawn: spawnFn as never,
        processRef: processRef as never,
        setInterval: vi.fn(() => 1 as unknown as NodeJS.Timeout),
        clearInterval: vi.fn(),
      },
    );

    expect(startLocalProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPort: 3000,
      }),
    );

    expect(apiClient.createTunnel).toHaveBeenCalledWith(
      'access',
      expect.objectContaining({
        port: 4545,
        requestedSlug: 'demo',
      }),
    );
    expect(createUpDashboard).toHaveBeenCalledWith({
      account: 'osama@example.com',
      version: '0.1.0',
      forwarding: 'https://demo.tunnel.example.com -> http://localhost:3000',
      verbose: false,
    });

    expect(dashboard.setMetrics).toHaveBeenCalled();
    expect((processRef.exit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(0);
    expect(proxyStop).toHaveBeenCalledTimes(1);
    expect(apiClient.stopTunnel).toHaveBeenCalledWith('access', 'tunnel-id');
    expect(spawnFn).toHaveBeenCalled();
  });

  it('emits raw cloudflared lines only when verbose mode is enabled', async () => {
    const runCase = async (verbose: boolean): Promise<number> => {
      const child = createFakeChildProcess();
      const dashboard = {
        setRegion: vi.fn(),
        setMetrics: vi.fn(),
        addRequest: vi.fn(),
        addCloudflaredLine: vi.fn(),
        addMessage: vi.fn(),
        stop: vi.fn(),
      };

      const apiClient = {
        refreshTokens: vi.fn(),
        createTunnel: vi.fn(async () => ({
          tunnelId: 'tunnel-id',
          hostname: 'demo.tunnel.example.com',
          cloudflaredToken: 'cf-token',
          tunnelRunToken: 'run-token',
          heartbeatIntervalSec: 20 as const,
          leaseTimeoutSec: 60,
        })),
        stopTunnel: vi.fn(async () => {}),
        heartbeat: vi.fn(async () => ({ expiresAt: '2026-01-01T00:00:00.000Z' })),
      };

      const { processRef } = createProcessRef();

      const spawnFn = vi.fn(() => {
        setImmediate(() => {
          child.stderr.write('location=iad\n');
          child.stderr.end();
          child.emit('exit', 0);
        });

        return child;
      });

      await upCommand(
        { port: 3000, verbose },
        {
          createApiClient: () => apiClient as never,
          requireSession: vi.fn(async () => ({
            accessToken: 'access',
            refreshToken: 'refresh',
            expiresAtEpochSec: 1,
            profile: {
              email: 'osama@example.com',
              slackUserId: 'U1',
              slackTeamId: 'TRIPESEED',
            },
          })),
          saveSession: vi.fn(async () => {}),
          ensureCloudflaredInstalled: vi.fn(async () => '/usr/local/bin/cloudflared'),
          startLocalProxy: vi.fn(async () => ({
            port: 4545,
            stop: vi.fn(async () => {}),
          })),
          createUpDashboard: vi.fn(() => dashboard),
          getCliVersion: vi.fn(() => '0.1.0'),
          spawn: spawnFn as never,
          processRef: processRef as never,
          setInterval: vi.fn(() => 1 as unknown as NodeJS.Timeout),
          clearInterval: vi.fn(),
        },
      );

      expect(dashboard.setRegion).toHaveBeenCalledWith('IAD');
      return dashboard.addCloudflaredLine.mock.calls.length;
    };

    expect(await runCase(false)).toBe(0);
    expect(await runCase(true)).toBeGreaterThan(0);
  });

  it('cleans up resources and kills child process on SIGINT', async () => {
    const child = createFakeChildProcess();
    const proxyStop = vi.fn(async () => {});

    const dashboard = {
      setRegion: vi.fn(),
      setMetrics: vi.fn(),
      addRequest: vi.fn(),
      addCloudflaredLine: vi.fn(),
      addMessage: vi.fn(),
      stop: vi.fn(),
    };

    const apiClient = {
      refreshTokens: vi.fn(),
      createTunnel: vi.fn(async () => ({
        tunnelId: 'tunnel-id',
        hostname: 'demo.tunnel.example.com',
        cloudflaredToken: 'cf-token',
        tunnelRunToken: 'run-token',
        heartbeatIntervalSec: 20 as const,
        leaseTimeoutSec: 60,
      })),
      stopTunnel: vi.fn(async () => {}),
      heartbeat: vi.fn(async () => ({ expiresAt: '2026-01-01T00:00:00.000Z' })),
    };

    const { processRef, listeners } = createProcessRef();

    child.kill = vi.fn((signal?: NodeJS.Signals) => {
      setImmediate(() => {
        child.emit('exit', signal === 'SIGINT' ? 130 : 0);
      });
      return true;
    });

    const runPromise = upCommand(
      { port: 3000, verbose: false },
      {
        createApiClient: () => apiClient as never,
        requireSession: vi.fn(async () => ({
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresAtEpochSec: 1,
          profile: {
            email: 'osama@example.com',
            slackUserId: 'U1',
            slackTeamId: 'TRIPESEED',
          },
        })),
        saveSession: vi.fn(async () => {}),
        ensureCloudflaredInstalled: vi.fn(async () => '/usr/local/bin/cloudflared'),
        startLocalProxy: vi.fn(async () => ({
          port: 4545,
          stop: proxyStop,
        })),
        createUpDashboard: vi.fn(() => dashboard),
        getCliVersion: vi.fn(() => '0.1.0'),
        spawn: vi.fn(() => child) as never,
        processRef: processRef as never,
        setInterval: vi.fn(() => 1 as unknown as NodeJS.Timeout),
        clearInterval: vi.fn(),
      },
    );

    await new Promise<void>((resolve) => setImmediate(resolve));

    const sigintHandler = listeners.get('SIGINT');
    if (!sigintHandler) {
      throw new Error('Expected SIGINT handler to be registered.');
    }

    sigintHandler();
    await runPromise;

    expect(child.kill).toHaveBeenCalledWith('SIGINT');
    expect(apiClient.stopTunnel).toHaveBeenCalledTimes(1);
    expect(child.kill.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      apiClient.stopTunnel.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(proxyStop).toHaveBeenCalledTimes(1);
    expect(dashboard.stop).toHaveBeenCalledTimes(1);
    expect((processRef.exit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(130);
  });

  it('does not overlap heartbeats while one is still in flight', async () => {
    const child = createFakeChildProcess();
    const dashboard = {
      setRegion: vi.fn(),
      setMetrics: vi.fn(),
      addRequest: vi.fn(),
      addCloudflaredLine: vi.fn(),
      addMessage: vi.fn(),
      stop: vi.fn(),
    };

    let resolveHeartbeat: (() => void) | undefined;
    const heartbeatPromise = new Promise<{ expiresAt: string }>((resolve) => {
      resolveHeartbeat = () => resolve({ expiresAt: '2026-01-01T00:00:00.000Z' });
    });

    const apiClient = {
      refreshTokens: vi.fn(),
      createTunnel: vi.fn(async () => ({
        tunnelId: 'tunnel-id',
        hostname: 'demo.tunnel.example.com',
        cloudflaredToken: 'cf-token',
        tunnelRunToken: 'run-token',
        heartbeatIntervalSec: 20 as const,
        leaseTimeoutSec: 60,
      })),
      stopTunnel: vi.fn(async () => {}),
      heartbeat: vi.fn(() => heartbeatPromise),
      ingestTelemetry: vi.fn(async () => {}),
    };

    const { processRef } = createProcessRef();
    const intervalCallbacks: Array<{ ms: number; fn: () => void }> = [];
    const setIntervalFn = vi.fn((fn: () => void, ms: number) => {
      intervalCallbacks.push({ fn, ms });
      return intervalCallbacks.length as unknown as NodeJS.Timeout;
    });

    const runPromise = upCommand(
      { port: 3000, verbose: false },
      {
        createApiClient: () => apiClient as never,
        requireSession: vi.fn(async () => ({
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresAtEpochSec: 1,
          profile: {
            email: 'osama@example.com',
            slackUserId: 'U1',
            slackTeamId: 'TRIPESEED',
          },
        })),
        saveSession: vi.fn(async () => {}),
        ensureCloudflaredInstalled: vi.fn(async () => '/usr/local/bin/cloudflared'),
        startLocalProxy: vi.fn(async () => ({
          port: 4545,
          stop: vi.fn(async () => {}),
        })),
        createUpDashboard: vi.fn(() => dashboard),
        getCliVersion: vi.fn(() => '0.1.0'),
        spawn: vi.fn(() => child) as never,
        processRef: processRef as never,
        setInterval: setIntervalFn as never,
        clearInterval: vi.fn(),
      },
    );

    await new Promise<void>((resolve) => setImmediate(resolve));

    const heartbeatInterval = intervalCallbacks.find((interval) => interval.ms === 20_000);
    if (!heartbeatInterval) {
      throw new Error('Expected heartbeat interval to be registered.');
    }

    heartbeatInterval.fn();
    heartbeatInterval.fn();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(apiClient.heartbeat).toHaveBeenCalledTimes(1);

    if (resolveHeartbeat) {
      resolveHeartbeat();
    }
    await new Promise<void>((resolve) => setImmediate(resolve));

    heartbeatInterval.fn();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(apiClient.heartbeat).toHaveBeenCalledTimes(2);

    child.emit('exit', 0);
    await runPromise;
  });
});
