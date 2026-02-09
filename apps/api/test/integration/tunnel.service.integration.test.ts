import { describe, expect, it, vi, beforeEach } from 'vitest';

import { TunnelService } from '../../src/services/tunnel.service.js';
import type { Env } from '../../src/config/env.js';
import type { Repository } from '../../src/db/repository.js';
import type { CloudflareService } from '../../src/services/cloudflare.service.js';

const env: Env = {
  NODE_ENV: 'test',
  PORT: 8080,
  API_BASE_URL: 'https://api-tunnel.internal.ripeseed.io',
  DATABASE_URL: 'postgres://x',
  JWT_SECRET: '1234567890123456',
  REFRESH_TOKEN_SECRET: '1234567890123456',
  JWT_ACCESS_TTL_MINUTES: 15,
  REFRESH_TTL_DAYS: 30,
  SLACK_CLIENT_ID: 'x',
  SLACK_CLIENT_SECRET: 'x',
  SLACK_REDIRECT_URI: 'https://api-tunnel.internal.ripeseed.io/v1/auth/slack/callback',
  RIPSEED_SLACK_TEAM_ID: 'T1',
  CLOUDFLARE_ACCOUNT_ID: 'A1',
  CLOUDFLARE_ZONE_ID: 'Z1',
  CLOUDFLARE_API_TOKEN: 'token',
  CLOUDFLARE_BASE_DOMAIN: 'tunnel.ripeseed.io',
  MAX_ACTIVE_TUNNELS: 5,
  HEARTBEAT_INTERVAL_SEC: 20,
  LEASE_TIMEOUT_SEC: 60,
  REAPER_INTERVAL_SEC: 30,
};

describe('TunnelService integration behaviors', () => {
  const repository = {
    countActiveTunnels: vi.fn(),
    findActiveTunnelBySlug: vi.fn(),
    createTunnel: vi.fn(),
    activateTunnel: vi.fn(),
    upsertLease: vi.fn(),
    createAuditLog: vi.fn(),
    markTunnelFailed: vi.fn(),
    findTunnelForUser: vi.fn(),
    listUserTunnels: vi.fn(),
    markTunnelStopping: vi.fn(),
    deleteLease: vi.fn(),
    markTunnelStopped: vi.fn(),
    getTunnelById: vi.fn(),
  };

  const cloudflare = {
    createTunnel: vi.fn(),
    configureTunnel: vi.fn(),
    createDnsRecord: vi.fn(),
    getTunnelToken: vi.fn(),
    deleteDnsRecord: vi.fn(),
    deleteTunnel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates tunnel and DNS record successfully', async () => {
    repository.countActiveTunnels.mockResolvedValue(0);
    repository.findActiveTunnelBySlug.mockResolvedValue(undefined);
    repository.createTunnel.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'demo-app',
      hostname: 'demo-app.tunnel.ripeseed.io',
    });
    cloudflare.createTunnel.mockResolvedValue({ id: 'cf-tunnel-id' });
    cloudflare.createDnsRecord.mockResolvedValue('dns-id');
    cloudflare.getTunnelToken.mockResolvedValue('cloudflared-token');

    const service = new TunnelService(
      env,
      repository as unknown as Repository,
      cloudflare as unknown as CloudflareService,
    );

    const result = await service.createTunnel({
      userId: '22222222-2222-2222-2222-222222222222',
      port: 3000,
      requestedSlug: 'demo-app',
    });

    expect(result.hostname).toBe('demo-app.tunnel.ripeseed.io');
    expect(result.cloudflaredToken).toBe('cloudflared-token');
    expect(cloudflare.configureTunnel).toHaveBeenCalledTimes(1);
    expect(cloudflare.createDnsRecord).toHaveBeenCalledTimes(1);
  });

  it('returns conflict when requested slug is already active', async () => {
    repository.countActiveTunnels.mockResolvedValue(0);
    repository.findActiveTunnelBySlug.mockResolvedValue({ id: 'existing' });

    const service = new TunnelService(
      env,
      repository as unknown as Repository,
      cloudflare as unknown as CloudflareService,
    );

    await expect(
      service.createTunnel({
        userId: '22222222-2222-2222-2222-222222222222',
        port: 3000,
        requestedSlug: 'demo-app',
      }),
    ).rejects.toThrowError(/already in use/);
  });

  it('deletes DNS then tunnel on stop', async () => {
    repository.findTunnelForUser.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      status: 'active',
      cfDnsRecordId: 'dns-id',
      cfTunnelId: 'cf-tunnel-id',
    });

    const service = new TunnelService(
      env,
      repository as unknown as Repository,
      cloudflare as unknown as CloudflareService,
    );

    await service.stopTunnel({
      userId: '22222222-2222-2222-2222-222222222222',
      tunnelIdentifier: '11111111-1111-1111-1111-111111111111',
    });

    expect(cloudflare.deleteDnsRecord).toHaveBeenCalledWith('dns-id');
    expect(cloudflare.deleteTunnel).toHaveBeenCalledWith('cf-tunnel-id');
    expect(repository.markTunnelStopped).toHaveBeenCalledTimes(1);
  });
});
