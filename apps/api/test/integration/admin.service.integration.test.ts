import { describe, expect, it, vi } from 'vitest';

import { AdminService } from '../../src/services/admin.service.js';
import type { Repository } from '../../src/db/repository.js';

describe('AdminService integration behaviors', () => {
  it('builds org-wide dashboard aggregates for the owner', async () => {
    const repository = {
      getUserById: vi.fn(async () => ({
        id: 'owner-1',
        email: 'owner@example.com',
        slackUserId: 'U1',
        slackTeamId: 'T1',
        adminRole: 'owner',
        roleGrantedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
      countUsers: vi.fn(async () => 3),
      countOrgActiveTunnels: vi.fn(async () => 2),
      getOrgLiveOpenConnections: vi.fn(async () => 9),
      getOrgTrafficSummary: vi.fn(async () => ({ requests: 200, errors: 10, bytes: 1024 })),
      countPendingCleanupJobs: vi.fn(async () => 1),
      listOrgTunnelStatusCounts: vi.fn(async () => [
        { status: 'active', count: 2 },
        { status: 'stopped', count: 4 },
      ]),
      listOrgRequestVolumeByHour: vi.fn(async () => [
        { bucketStart: new Date('2026-01-01T00:00:00.000Z'), requests: 12, errors: 1 },
      ]),
      listOrgBandwidthByHour: vi.fn(async () => [
        { bucketStart: new Date('2026-01-01T00:00:00.000Z'), bytes: 512 },
      ]),
      listAdminTunnels: vi.fn(async () => [
        {
          id: 'tunnel-1',
          userId: 'user-1',
          userEmail: 'member@example.com',
          hostname: 'demo.tunnel.example.com',
          slug: 'demo',
          status: 'active',
          requestedPort: 3000,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          stoppedAt: null,
          lastError: null,
          receivedAt: new Date('2026-01-01T00:10:00.000Z'),
          region: 'IAD',
          ttl: 20,
          opn: 4,
          rt1Ms: 10,
          p90Ms: 28,
          requests: 120,
          errors: 2,
          bytes: 2048,
          lastHeartbeatAt: new Date('2026-01-01T00:10:00.000Z'),
          expiresAt: new Date('2026-01-01T00:11:00.000Z'),
        },
      ]),
      listAdminUsers: vi.fn(async () => [
        {
          user: {
            id: 'owner-1',
            email: 'owner@example.com',
            slackUserId: 'U1',
            slackTeamId: 'T1',
            adminRole: 'owner',
            roleGrantedAt: new Date('2026-01-01T00:00:00.000Z'),
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
          activeTunnelCount: 1,
          totalTunnelCount: 2,
          lastAuditAt: '2026-01-01T00:20:00.000Z',
        },
      ]),
      listRecentActivity: vi.fn(async () => [
        {
          audit: {
            id: 'audit-1',
            createdAt: new Date('2026-01-01T00:20:00.000Z'),
            action: 'tunnel.created',
            userId: 'user-1',
            metadata: { hostname: 'demo.tunnel.example.com' },
          },
          userEmail: 'member@example.com',
        },
      ]),
    };

    const service = new AdminService(repository as unknown as Repository);
    const dashboard = await service.getDashboard('owner-1');

    expect(dashboard.summary).toMatchObject({
      totalUsers: 3,
      activeTunnels: 2,
      liveOpenConnections: 9,
      requestsLast24h: 200,
      errorRateLast24h: 5,
      bytesLast24h: 1024,
      pendingCleanupJobs: 1,
    });
    expect(dashboard.liveTunnels[0]).toMatchObject({
      hostname: 'demo.tunnel.example.com',
      userEmail: 'member@example.com',
    });
    expect(dashboard.users[0]).toMatchObject({
      email: 'owner@example.com',
      role: 'owner',
    });
    expect(dashboard.recentActivity[0]).toMatchObject({
      action: 'tunnel.created',
      userEmail: 'member@example.com',
    });
  });
});
