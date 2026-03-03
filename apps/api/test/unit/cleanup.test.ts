import { describe, expect, it, vi } from 'vitest';

import { TunnelService } from '../../src/services/tunnel.service.js';
import type { Env } from '../../src/config/env.js';
import type { Repository } from '../../src/db/repository.js';
import type { CloudflareService } from '../../src/services/cloudflare.service.js';

const env: Env = {
  NODE_ENV: 'test',
  PORT: 8080,
  API_BASE_URL: 'http://localhost:8080',
  DATABASE_URL: 'postgres://x',
  JWT_SECRET: '1234567890123456',
  REFRESH_TOKEN_SECRET: '1234567890123456',
  JWT_ACCESS_TTL_MINUTES: 15,
  REFRESH_TTL_DAYS: 30,
  SLACK_CLIENT_ID: 'x',
  SLACK_CLIENT_SECRET: 'x',
  SLACK_REDIRECT_URI: 'http://localhost:8080/v1/auth/slack/callback',
  ALLOWED_EMAIL_DOMAIN: '@example.com',
  ALLOWED_SLACK_TEAM_ID: 'T1',
  CLOUDFLARE_ACCOUNT_ID: 'A1',
  CLOUDFLARE_ZONE_ID: 'Z1',
  CLOUDFLARE_API_TOKEN: 'token',
  CLOUDFLARE_BASE_DOMAIN: 'tunnel.example.com',
  MAX_ACTIVE_TUNNELS: 5,
  HEARTBEAT_INTERVAL_SEC: 20,
  LEASE_TIMEOUT_SEC: 60,
  REAPER_INTERVAL_SEC: 30,
};

describe('cleanup idempotency', () => {
  it('does not throw when stopping a tunnel without dns/tunnel ids', async () => {
    const repository = {
      getTunnelById: vi.fn().mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        status: 'active',
        cfDnsRecordId: null,
        cfTunnelId: null,
      }),
      markTunnelStopping: vi.fn().mockResolvedValue(undefined),
      deleteLease: vi.fn().mockResolvedValue(undefined),
      markTunnelStopped: vi.fn().mockResolvedValue(undefined),
      createAuditLog: vi.fn().mockResolvedValue(undefined),
    };

    const cloudflare = {
      deleteDnsRecord: vi.fn().mockResolvedValue(undefined),
      deleteTunnel: vi.fn().mockResolvedValue(undefined),
    };

    const service = new TunnelService(
      env,
      repository as unknown as Repository,
      cloudflare as unknown as CloudflareService,
    );

    await expect(service.stopTunnelById('11111111-1111-1111-1111-111111111111', 'cleanup')).resolves.toBeUndefined();
    expect(repository.markTunnelStopped).toHaveBeenCalledTimes(1);
    expect(cloudflare.deleteDnsRecord).not.toHaveBeenCalled();
    expect(cloudflare.deleteTunnel).not.toHaveBeenCalled();
  });

  it('enqueues cleanup job and throws when tunnel has active connections', async () => {
    const repository = {
      getTunnelById: vi.fn().mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        status: 'active',
        cfDnsRecordId: 'dns123',
        cfTunnelId: 'tunnel123',
      }),
      markTunnelStopping: vi.fn().mockResolvedValue(undefined),
      deleteLease: vi.fn().mockResolvedValue(undefined),
      markTunnelStopped: vi.fn().mockResolvedValue(undefined),
      createAuditLog: vi.fn().mockResolvedValue(undefined),
      enqueueCleanupJob: vi.fn().mockResolvedValue(undefined),
    };

    const cloudflare = {
      deleteDnsRecord: vi.fn().mockResolvedValue(undefined),
      deleteTunnelWithRetry: vi.fn().mockResolvedValue({ success: false, reason: 'active_connections' }),
    };

    const service = new TunnelService(
      env,
      repository as unknown as Repository,
      cloudflare as unknown as CloudflareService,
    );

    await expect(service.stopTunnelById('11111111-1111-1111-1111-111111111111', 'cleanup')).rejects.toThrow(/active connections/);
    expect(repository.markTunnelStopping).toHaveBeenCalledTimes(1);
    expect(cloudflare.deleteDnsRecord).toHaveBeenCalledTimes(1);
    expect(cloudflare.deleteTunnelWithRetry).toHaveBeenCalledTimes(1);
    expect(repository.enqueueCleanupJob).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', 'active_connections');
    expect(repository.markTunnelStopped).not.toHaveBeenCalled();
  });

  it('completes stop when tunnel deletion succeeds', async () => {
    const repository = {
      getTunnelById: vi.fn().mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        status: 'active',
        cfDnsRecordId: 'dns123',
        cfTunnelId: 'tunnel123',
      }),
      markTunnelStopping: vi.fn().mockResolvedValue(undefined),
      deleteLease: vi.fn().mockResolvedValue(undefined),
      markTunnelStopped: vi.fn().mockResolvedValue(undefined),
      createAuditLog: vi.fn().mockResolvedValue(undefined),
      enqueueCleanupJob: vi.fn().mockResolvedValue(undefined),
    };

    const cloudflare = {
      deleteDnsRecord: vi.fn().mockResolvedValue(undefined),
      deleteTunnelWithRetry: vi.fn().mockResolvedValue({ success: true }),
    };

    const service = new TunnelService(
      env,
      repository as unknown as Repository,
      cloudflare as unknown as CloudflareService,
    );

    await expect(service.stopTunnelById('11111111-1111-1111-1111-111111111111', 'cleanup')).resolves.toBeUndefined();
    expect(repository.markTunnelStopping).toHaveBeenCalledTimes(1);
    expect(cloudflare.deleteDnsRecord).toHaveBeenCalledTimes(1);
    expect(cloudflare.deleteTunnelWithRetry).toHaveBeenCalledTimes(1);
    expect(repository.enqueueCleanupJob).not.toHaveBeenCalled();
    expect(repository.markTunnelStopped).toHaveBeenCalledTimes(1);
    expect(repository.createAuditLog).toHaveBeenCalledTimes(1);
  });

  it('enqueues cleanup job and throws on other cloudflare errors', async () => {
    const repository = {
      getTunnelById: vi.fn().mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        status: 'active',
        cfDnsRecordId: 'dns123',
        cfTunnelId: 'tunnel123',
      }),
      markTunnelStopping: vi.fn().mockResolvedValue(undefined),
      deleteLease: vi.fn().mockResolvedValue(undefined),
      markTunnelStopped: vi.fn().mockResolvedValue(undefined),
      createAuditLog: vi.fn().mockResolvedValue(undefined),
      enqueueCleanupJob: vi.fn().mockResolvedValue(undefined),
    };

    const cloudflare = {
      deleteDnsRecord: vi.fn().mockResolvedValue(undefined),
      deleteTunnelWithRetry: vi.fn().mockResolvedValue({ success: false, reason: 'error', message: 'Network error' }),
    };

    const service = new TunnelService(
      env,
      repository as unknown as Repository,
      cloudflare as unknown as CloudflareService,
    );

    await expect(service.stopTunnelById('11111111-1111-1111-1111-111111111111', 'cleanup')).rejects.toThrow(/Network error/);
    expect(repository.markTunnelStopping).toHaveBeenCalledTimes(1);
    expect(cloudflare.deleteDnsRecord).toHaveBeenCalledTimes(1);
    expect(cloudflare.deleteTunnelWithRetry).toHaveBeenCalledTimes(1);
    expect(repository.enqueueCleanupJob).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', 'deletion_failed');
    expect(repository.markTunnelStopped).not.toHaveBeenCalled();
  });
});
