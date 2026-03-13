import {
  adminActivityResponseSchema,
  adminBootstrapStatusSchema,
  adminDashboardSchema,
  adminSessionSchema,
  adminTunnelDetailResponseSchema,
  adminTunnelsListResponseSchema,
  adminUsersListResponseSchema,
  adminWebAuthExchangeRequestSchema,
  adminWebAuthStartResponseSchema,
  tunnelMetricsResponseSchema,
  tunnelRequestsResponseSchema,
} from '@ripeseed/shared';
import type { FastifyInstance } from 'fastify';

import { AppError } from '../lib/app-error.js';

function parseIsoDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, 'INVALID_INPUT', 'Invalid ISO date.');
  }

  return date;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/bootstrap', async () => {
    return adminBootstrapStatusSchema.parse(await app.services.adminService.getBootstrapStatus());
  });

  app.post(
    '/admin/auth/slack/start',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async () => {
      return adminWebAuthStartResponseSchema.parse(await app.services.authService.startAdminWebSlackAuth());
    },
  );

  app.post(
    '/admin/auth/exchange',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      const parsed = adminWebAuthExchangeRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new AppError(400, 'INVALID_INPUT', 'Invalid admin auth exchange payload.', parsed.error.flatten());
      }

      return app.services.authService.exchangeAdminWebLoginCode(parsed.data);
    },
  );

  app.get('/admin/session', { preHandler: app.authenticate }, async (request) => {
    return adminSessionSchema.parse(await app.services.adminService.getSession(request.auth!.sub));
  });

  app.get('/admin/dashboard', { preHandler: app.authenticate }, async (request) => {
    return adminDashboardSchema.parse(await app.services.adminService.getDashboard(request.auth!.sub));
  });

  app.get('/admin/users', { preHandler: app.authenticate }, async (request) => {
    return adminUsersListResponseSchema.parse(await app.services.adminService.listUsers(request.auth!.sub));
  });

  app.get('/admin/tunnels', { preHandler: app.authenticate }, async (request) => {
    return adminTunnelsListResponseSchema.parse(await app.services.adminService.listTunnels(request.auth!.sub));
  });

  app.get('/admin/tunnels/:id', { preHandler: app.authenticate }, async (request) => {
    const params = request.params as { id?: string };
    if (!params.id) {
      throw new AppError(400, 'INVALID_TUNNEL_ID', 'Tunnel identifier is required.');
    }

    return adminTunnelDetailResponseSchema.parse(
      await app.services.adminService.getTunnelDetail({
        userId: request.auth!.sub,
        tunnelId: params.id,
      }),
    );
  });

  app.get('/admin/tunnels/:id/metrics', { preHandler: app.authenticate }, async (request) => {
    const params = request.params as { id?: string };
    if (!params.id) {
      throw new AppError(400, 'INVALID_TUNNEL_ID', 'Tunnel identifier is required.');
    }

    const query = request.query as { from?: string; to?: string };
    if (!query.from || !query.to) {
      throw new AppError(400, 'INVALID_INPUT', 'Missing from/to query parameters.');
    }

    const from = parseIsoDate(query.from);
    const to = parseIsoDate(query.to);
    if (from.getTime() > to.getTime()) {
      throw new AppError(400, 'INVALID_INPUT', 'from must be <= to.');
    }

    return tunnelMetricsResponseSchema.parse(
      await app.services.adminService.getTunnelMetrics({
        userId: request.auth!.sub,
        tunnelId: params.id,
        from,
        to,
        limit: 5000,
      }),
    );
  });

  app.get('/admin/tunnels/:id/requests', { preHandler: app.authenticate }, async (request) => {
    const params = request.params as { id?: string };
    if (!params.id) {
      throw new AppError(400, 'INVALID_TUNNEL_ID', 'Tunnel identifier is required.');
    }

    const query = request.query as { after?: string; limit?: string };
    const after = query.after ? parseIsoDate(query.after) : null;
    const requestedLimit = query.limit ? Number.parseInt(query.limit, 10) : 200;
    const limit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(1, requestedLimit)) : 200;

    return tunnelRequestsResponseSchema.parse(
      await app.services.adminService.getTunnelRequests({
        userId: request.auth!.sub,
        tunnelId: params.id,
        after,
        limit,
      }),
    );
  });

  app.get('/admin/activity', { preHandler: app.authenticate }, async (request) => {
    const query = request.query as { limit?: string };
    const requestedLimit = query.limit ? Number.parseInt(query.limit, 10) : 50;
    const limit = Number.isFinite(requestedLimit) ? Math.min(200, Math.max(1, requestedLimit)) : 50;

    return adminActivityResponseSchema.parse(
      await app.services.adminService.listActivity({
        userId: request.auth!.sub,
        limit,
      }),
    );
  });
}
