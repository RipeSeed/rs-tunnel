import { tunnelTelemetryIngestRequestSchema } from '@ripeseed/shared';
import type { FastifyInstance } from 'fastify';

import { AppError } from '../lib/app-error.js';

function parseIsoDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, 'INVALID_INPUT', 'Invalid ISO date.');
  }
  return date;
}

export async function registerTelemetryRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/tunnels/:id/telemetry',
    {
      preHandler: app.authenticateTunnelRuntime,
      config: {
        rateLimit: {
          max: 1200,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      const params = request.params as { id?: string };
      if (!params.id) {
        throw new AppError(400, 'INVALID_TUNNEL_ID', 'Tunnel identifier is required.');
      }

      const parsed = tunnelTelemetryIngestRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, 'INVALID_INPUT', 'Invalid telemetry payload.', parsed.error.flatten());
      }

      if (request.tunnelRuntimeAuth?.tunnelId !== params.id) {
        throw new AppError(403, 'FORBIDDEN', 'Tunnel runtime token does not match the requested tunnel.');
      }

      await app.services.telemetryService.ingestRuntimeTelemetry({
        tunnelId: params.id,
        region: parsed.data.region ?? null,
        metrics: parsed.data.metrics,
        requests: parsed.data.requests,
      });

      return { ok: true as const };
    },
  );

  app.get(
    '/tunnels/telemetry',
    {
      preHandler: app.authenticate,
      config: {
        rateLimit: {
          max: 600,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      return app.services.telemetryService.getLiveTelemetry(request.auth!.sub);
    },
  );

  app.get('/tunnels/:id/metrics', { preHandler: app.authenticate }, async (request) => {
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

    return app.services.telemetryService.getMetricsHistory({
      userId: request.auth!.sub,
      tunnelId: params.id,
      from,
      to,
      limit: 5000,
    });
  });

  app.get('/tunnels/:id/requests', { preHandler: app.authenticate }, async (request) => {
    const params = request.params as { id?: string };
    if (!params.id) {
      throw new AppError(400, 'INVALID_TUNNEL_ID', 'Tunnel identifier is required.');
    }

    const query = request.query as { after?: string; limit?: string };
    const after = query.after ? parseIsoDate(query.after) : null;

    const requestedLimit = query.limit ? Number.parseInt(query.limit, 10) : 200;
    const limit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(1, requestedLimit)) : 200;

    return app.services.telemetryService.getRequestLogs({
      userId: request.auth!.sub,
      tunnelId: params.id,
      after,
      limit,
    });
  });
}
