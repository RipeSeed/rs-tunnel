import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { upCommand } from './up.js';

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
        hostname: 'demo.tunnel.ripeseed.io',
        cloudflaredToken: 'cf-token',
        heartbeatIntervalSec: 20 as const,
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
            email: 'osama@ripeseed.io',
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
      account: 'osama@ripeseed.io',
      version: '0.1.0',
      forwarding: 'https://demo.tunnel.ripeseed.io -> http://localhost:3000',
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
          hostname: 'demo.tunnel.ripeseed.io',
          cloudflaredToken: 'cf-token',
          heartbeatIntervalSec: 20 as const,
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
              email: 'osama@ripeseed.io',
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
        hostname: 'demo.tunnel.ripeseed.io',
        cloudflaredToken: 'cf-token',
        heartbeatIntervalSec: 20 as const,
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
            email: 'osama@ripeseed.io',
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
    expect(proxyStop).toHaveBeenCalledTimes(1);
    expect(dashboard.stop).toHaveBeenCalledTimes(1);
    expect((processRef.exit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(130);
  });
});
