import {
  authExchangeRequestSchema,
  authStartRequestSchema,
  refreshRequestSchema,
} from '@ripeseed/shared';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import { AppError } from '../lib/app-error.js';

const logoutRequestSchema = z.object({
  refreshToken: z.string().optional(),
});

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/auth/slack/start',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      const parsed = authStartRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new AppError(400, 'INVALID_INPUT', 'Invalid auth start request payload.', parsed.error.flatten());
      }

      return app.services.authService.startSlackAuth(parsed.data);
    },
  );

  app.get('/auth/slack/callback', async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;

    if (query.error) {
      throw new AppError(400, 'SLACK_OAUTH_DENIED', `Slack OAuth denied: ${query.error}`);
    }

    if (!query.state || !query.code) {
      throw new AppError(400, 'MISSING_OAUTH_PARAMS', 'Slack OAuth callback is missing state or code.');
    }

    const { redirectUrl } = await app.services.authService.handleSlackCallback({
      state: query.state,
      code: query.code,
    });

    return reply.redirect(redirectUrl);
  });

  app.post(
    '/auth/exchange',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      const parsed = authExchangeRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new AppError(400, 'INVALID_INPUT', 'Invalid auth exchange request payload.', parsed.error.flatten());
      }

      return app.services.authService.exchangeLoginCode(parsed.data);
    },
  );

  app.post('/auth/refresh', async (request) => {
    const parsed = refreshRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(400, 'INVALID_INPUT', 'Invalid token refresh payload.', parsed.error.flatten());
    }

    return app.services.authService.refreshTokens(parsed.data.refreshToken);
  });

  app.post('/auth/logout', { preHandler: app.authenticate }, async (request) => {
    const parsed = logoutRequestSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      throw new AppError(400, 'INVALID_INPUT', 'Invalid logout request payload.', parsed.error.flatten());
    }

    await app.services.authService.logout({
      userId: request.auth?.sub,
      refreshToken: parsed.data.refreshToken,
    });

    return { ok: true };
  });
}
