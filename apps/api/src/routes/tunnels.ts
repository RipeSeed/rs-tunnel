import { tunnelCreateRequestSchema } from '@ripeseed/shared';
import type { FastifyInstance } from 'fastify';

import { AppError } from '../lib/app-error.js';

export async function registerTunnelRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tunnels', { preHandler: app.authenticate }, async (request) => {
    return app.services.tunnelService.listTunnels(request.auth!.sub);
  });

  app.post(
    '/tunnels',
    {
      preHandler: app.authenticate,
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      const parsed = tunnelCreateRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new AppError(400, 'INVALID_INPUT', 'Invalid tunnel creation payload.', parsed.error.flatten());
      }

      return app.services.tunnelService.createTunnel({
        userId: request.auth!.sub,
        port: parsed.data.port,
        requestedSlug: parsed.data.requestedSlug,
      });
    },
  );

  app.post('/tunnels/:id/heartbeat', { preHandler: app.authenticate }, async (request) => {
    const params = request.params as { id?: string };
    if (!params.id) {
      throw new AppError(400, 'INVALID_TUNNEL_ID', 'Tunnel identifier is required.');
    }

    const result = await app.services.tunnelService.heartbeat({
      userId: request.auth!.sub,
      tunnelIdentifier: params.id,
    });

    return {
      ok: true as const,
      expiresAt: result.expiresAt,
    };
  });

  app.delete('/tunnels/:id', { preHandler: app.authenticate }, async (request) => {
    const params = request.params as { id?: string };
    if (!params.id) {
      throw new AppError(400, 'INVALID_TUNNEL_ID', 'Tunnel identifier is required.');
    }

    await app.services.tunnelService.stopTunnel({
      userId: request.auth!.sub,
      tunnelIdentifier: params.id,
    });

    return { ok: true };
  });
}
