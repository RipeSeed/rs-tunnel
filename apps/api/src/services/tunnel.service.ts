import { AppError } from '../lib/app-error.js';
import { logger } from '../lib/logger.js';
import { Repository } from '../db/repository.js';
import { type DbTunnel } from '../db/schema.js';
import { createLeaseExpiry } from '../utils/lease.js';
import { generateRandomSlug, validateRequestedSlug } from '../utils/slug.js';
import type { Env } from '../config/env.js';
import type { TunnelService as TunnelServiceContract, TunnelSummary } from '../types.js';
import { CloudflareService } from './cloudflare.service.js';
import { assertWithinTunnelLimit } from './quota.js';

const ACTIVE_STATES = new Set(['active', 'stopping']);

export class TunnelService implements TunnelServiceContract {
  constructor(
    private readonly env: Env,
    private readonly repository: Repository,
    private readonly cloudflareService: CloudflareService,
  ) {}

  async createTunnel(input: {
    userId: string;
    port: number;
    requestedSlug?: string;
  }): Promise<{
    tunnelId: string;
    hostname: string;
    cloudflaredToken: string;
    heartbeatIntervalSec: 20;
  }> {
    if (input.port < 1 || input.port > 65535) {
      throw new AppError(400, 'INVALID_PORT', 'Port must be between 1 and 65535.');
    }

    const activeCount = await this.repository.countActiveTunnels(input.userId);
    assertWithinTunnelLimit(activeCount, this.env.MAX_ACTIVE_TUNNELS);

    const slug = await this.reserveSlug(input.requestedSlug);
    const hostname = `${slug}.${this.env.CLOUDFLARE_BASE_DOMAIN}`;

    const dbTunnel = await this.repository.createTunnel({
      userId: input.userId,
      slug,
      hostname,
      requestedPort: input.port,
    });

    let cfTunnelId: string | undefined;
    let cfDnsRecordId: string | undefined;

    try {
      const tunnelName = `rs-${slug}-${Date.now()}`;
      const cfTunnel = await this.cloudflareService.createTunnel(tunnelName);
      cfTunnelId = cfTunnel.id;

      await this.cloudflareService.configureTunnel({
        tunnelId: cfTunnel.id,
        hostname,
        port: input.port,
      });

      cfDnsRecordId = await this.cloudflareService.createDnsRecord(hostname, cfTunnel.id);
      const cloudflaredToken = await this.cloudflareService.getTunnelToken(cfTunnel.id);

      await this.repository.activateTunnel({
        tunnelId: dbTunnel.id,
        cfTunnelId: cfTunnel.id,
        cfDnsRecordId,
      });

      const now = new Date();
      await this.repository.upsertLease(
        dbTunnel.id,
        now,
        createLeaseExpiry(now, this.env.LEASE_TIMEOUT_SEC),
      );

      await this.repository.createAuditLog({
        userId: input.userId,
        action: 'tunnel.created',
        metadata: {
          tunnelId: dbTunnel.id,
          slug,
          hostname,
        },
      });

      return {
        tunnelId: dbTunnel.id,
        hostname,
        cloudflaredToken,
        heartbeatIntervalSec: 20,
      };
    } catch (error) {
      await this.repository.markTunnelFailed(dbTunnel.id, error instanceof Error ? error.message : 'Unknown error');

      if (cfDnsRecordId) {
        await this.cloudflareService.deleteDnsRecord(cfDnsRecordId).catch((cleanupError) => {
          logger.error('Failed DNS rollback after tunnel creation error', cleanupError);
        });
      }

      if (cfTunnelId) {
        await this.cloudflareService.deleteTunnel(cfTunnelId).catch((cleanupError) => {
          logger.error('Failed tunnel rollback after tunnel creation error', cleanupError);
        });
      }

      throw error;
    }
  }

  async listTunnels(userId: string): Promise<TunnelSummary[]> {
    const rows = await this.repository.listUserTunnels(userId);

    return rows.map((row) => ({
      id: row.id,
      hostname: row.hostname,
      slug: row.slug,
      status: row.status,
      requestedPort: row.requestedPort,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async heartbeat(input: { userId: string; tunnelIdentifier: string }): Promise<{ expiresAt: string }> {
    const tunnel = await this.repository.findTunnelForUser(input.userId, input.tunnelIdentifier);

    if (!tunnel || !ACTIVE_STATES.has(tunnel.status)) {
      throw new AppError(404, 'TUNNEL_NOT_FOUND', 'Tunnel was not found for this user.');
    }

    const now = new Date();
    const expiresAt = createLeaseExpiry(now, this.env.LEASE_TIMEOUT_SEC);
    await this.repository.upsertLease(tunnel.id, now, expiresAt);

    return {
      expiresAt: expiresAt.toISOString(),
    };
  }

  async stopTunnel(input: { userId: string; tunnelIdentifier: string }): Promise<void> {
    const tunnel = await this.repository.findTunnelForUser(input.userId, input.tunnelIdentifier);

    if (!tunnel) {
      throw new AppError(404, 'TUNNEL_NOT_FOUND', 'Tunnel was not found for this user.');
    }

    await this.stopInternal(tunnel, 'user_requested');
  }

  async stopTunnelById(tunnelId: string, reason: string): Promise<void> {
    const tunnel = await this.repository.getTunnelById(tunnelId);
    if (!tunnel) {
      return;
    }

    if (!ACTIVE_STATES.has(tunnel.status)) {
      return;
    }

    await this.stopInternal(tunnel, reason);
  }

  private async stopInternal(tunnel: DbTunnel, reason: string): Promise<void> {
    await this.repository.markTunnelStopping(tunnel.id);

    if (tunnel.cfDnsRecordId) {
      await this.cloudflareService.deleteDnsRecord(tunnel.cfDnsRecordId);
    }

    if (tunnel.cfTunnelId) {
      const result = await this.cloudflareService.deleteTunnelWithRetry(tunnel.cfTunnelId);
      if (!result.success) {
        const cleanupReason = result.reason === 'active_connections' ? 'active_connections' : 'deletion_failed';
        await this.repository.enqueueCleanupJob(tunnel.id, cleanupReason);

        if (result.reason === 'active_connections') {
          logger.info('Tunnel has active connections, will retry via cleanup job', {
            tunnelId: tunnel.id,
            cfTunnelId: tunnel.cfTunnelId,
          });
          // Signal to cleanup workers that the tunnel has not fully stopped yet
          throw new AppError(
            503,
            'TUNNEL_STOP_PENDING_ACTIVE_CONNECTIONS',
            'Tunnel has active connections and will be stopped once they drain.',
          );
        }

        // For other errors, log and throw so cleanup worker retries
        logger.error('Failed to delete tunnel from Cloudflare', {
          tunnelId: tunnel.id,
          cfTunnelId: tunnel.cfTunnelId,
          reason: result.reason,
          message: result.message,
        });
        throw new AppError(
          502,
          'TUNNEL_CLOUDFLARE_DELETION_FAILED',
          result.message ?? 'Failed to delete tunnel from Cloudflare; cleanup will be retried.',
        );
      }
    }

    await this.repository.deleteLease(tunnel.id);
    await this.repository.markTunnelStopped(tunnel.id);

    await this.repository.createAuditLog({
      userId: tunnel.userId,
      action: 'tunnel.stopped',
      metadata: {
        tunnelId: tunnel.id,
        reason,
      },
    });
  }

  private async reserveSlug(requestedSlug?: string): Promise<string> {
    if (requestedSlug) {
      const normalized = validateRequestedSlug(requestedSlug);
      const existing = await this.repository.findActiveTunnelBySlug(normalized);
      if (existing) {
        throw new AppError(409, 'TUNNEL_SLUG_CONFLICT', 'Requested URL slug is already in use.');
      }

      return normalized;
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = generateRandomSlug();
      const existing = await this.repository.findActiveTunnelBySlug(candidate);
      if (!existing) {
        return candidate;
      }
    }

    throw new AppError(503, 'SLUG_EXHAUSTED', 'Unable to reserve a unique tunnel slug.');
  }
}
