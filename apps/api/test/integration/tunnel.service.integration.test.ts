import { describe, expect, it, vi, beforeEach } from 'vitest';

import { TunnelService } from '../../src/services/tunnel.service.js';
import type { Env } from '../../src/config/env.js';
import type { Repository } from '../../src/db/repository.js';
import type { CloudflareService } from '../../src/services/cloudflare.service.js';

const env: Env = {
  NODE_ENV: 'test',
  PORT: 8080,
  API_BASE_URL: 'http://localhost:8080',
  ADMIN_WEB_BASE_URL: 'http://localhost:3001',
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
    deleteTunnelWithRetry: vi.fn(),
  };

  const tokenService = {
    signTunnelRunToken: vi.fn(() => 'runtime-token'),
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
      hostname: 'demo-app.tunnel.example.com',
    });
    cloudflare.createTunnel.mockResolvedValue({ id: 'cf-tunnel-id' });
    cloudflare.createDnsRecord.mockResolvedValue('dns-id');
    cloudflare.getTunnelToken.mockResolvedValue('cloudflared-token');

    const service = new TunnelService(
      env,
      repository as unknown as Repository,
      cloudflare as unknown as CloudflareService,
      tokenService as never,
    );

    const result = await service.createTunnel({
      userId: '22222222-2222-2222-2222-222222222222',
      port: 3000,
      requestedSlug: 'demo-app',
    });

    expect(result.hostname).toBe('demo-app.tunnel.example.com');
    expect(result.cloudflaredToken).toBe('cloudflared-token');
    expect(result.tunnelRunToken).toBe('runtime-token');
    expect(result.heartbeatIntervalSec).toBe(20);
    expect(result.leaseTimeoutSec).toBe(60);
    expect(cloudflare.configureTunnel).toHaveBeenCalledTimes(1);
    expect(cloudflare.createDnsRecord).toHaveBeenCalledTimes(1);
    expect(tokenService.signTunnelRunToken).toHaveBeenCalledWith({
      tunnelId: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('returns conflict when requested slug is already active', async () => {
    repository.countActiveTunnels.mockResolvedValue(0);
    repository.findActiveTunnelBySlug.mockResolvedValue({ id: 'existing' });

    const service = new TunnelService(
      env,
      repository as unknown as Repository,
      cloudflare as unknown as CloudflareService,
      tokenService as never,
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
    cloudflare.deleteTunnelWithRetry.mockResolvedValue({ success: true });

    const service = new TunnelService(
      env,
      repository as unknown as Repository,
      cloudflare as unknown as CloudflareService,
      tokenService as never,
    );

    await service.stopTunnel({
      userId: '22222222-2222-2222-2222-222222222222',
      tunnelIdentifier: '11111111-1111-1111-1111-111111111111',
    });

    expect(cloudflare.deleteDnsRecord).toHaveBeenCalledWith('dns-id');
    expect(cloudflare.deleteTunnelWithRetry).toHaveBeenCalledWith('cf-tunnel-id');
    expect(repository.markTunnelStopped).toHaveBeenCalledTimes(1);
  });

  it('allows reusing slug after tunnel is stopped', async () => {
    // First tunnel creation succeeds
    repository.countActiveTunnels.mockResolvedValue(0);
    repository.findActiveTunnelBySlug.mockResolvedValue(undefined);
    repository.createTunnel.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'my-app',
      hostname: 'my-app.tunnel.example.com',
    });
    cloudflare.createTunnel.mockResolvedValue({ id: 'cf-tunnel-1' });
    cloudflare.createDnsRecord.mockResolvedValue('dns-id-1');
    cloudflare.getTunnelToken.mockResolvedValue('token-1');

    const service = new TunnelService(
      env,
      repository as unknown as Repository,
      cloudflare as unknown as CloudflareService,
      tokenService as never,
    );

    // Create first tunnel
    await service.createTunnel({
      userId: '22222222-2222-2222-2222-222222222222',
      port: 3000,
      requestedSlug: 'my-app',
    });

    // Now simulate that the tunnel is stopped (findActiveTunnelBySlug returns undefined)
    repository.findActiveTunnelBySlug.mockResolvedValue(undefined);

    // Create second tunnel with same slug - should succeed
    repository.createTunnel.mockResolvedValue({
      id: '33333333-3333-3333-3333-333333333333',
      slug: 'my-app',
      hostname: 'my-app.tunnel.example.com',
    });
    cloudflare.createTunnel.mockResolvedValue({ id: 'cf-tunnel-2' });
    cloudflare.createDnsRecord.mockResolvedValue('dns-id-2');
    cloudflare.getTunnelToken.mockResolvedValue('token-2');

    const result = await service.createTunnel({
      userId: '22222222-2222-2222-2222-222222222222',
      port: 3001,
      requestedSlug: 'my-app',
    });

    expect(result.hostname).toBe('my-app.tunnel.example.com');
    expect(result.cloudflaredToken).toBe('token-2');
  });

  it('extends lease for active tunnels via runtime heartbeat', async () => {
    repository.getTunnelById.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      status: 'active',
    });

    const service = new TunnelService(
      env,
      repository as unknown as Repository,
      cloudflare as unknown as CloudflareService,
      tokenService as never,
    );

    const result = await service.heartbeatTunnel({
      tunnelId: '11111111-1111-1111-1111-111111111111',
    });

    expect(result.expiresAt).toMatch(/2026|20\d\d/);
    expect(repository.upsertLease).toHaveBeenCalledTimes(1);
  });

  it('rejects runtime heartbeat for stopping tunnels', async () => {
    repository.getTunnelById.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      status: 'stopping',
    });

    const service = new TunnelService(
      env,
      repository as unknown as Repository,
      cloudflare as unknown as CloudflareService,
      tokenService as never,
    );

    await expect(
      service.heartbeatTunnel({
        tunnelId: '11111111-1111-1111-1111-111111111111',
      }),
    ).rejects.toThrowError(/no longer active/i);
  });
});
