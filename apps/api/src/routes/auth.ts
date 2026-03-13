import {
  authExchangeRequestSchema,
  authStatusRequestSchema,
  authStatusResponseSchema,
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

    const result = await app.services.authService.handleSlackCallback({
      state: query.state,
      code: query.code,
    });

    if (result.mode === 'web' && result.redirectUrl) {
      return reply.redirect(result.redirectUrl);
    }

    return reply
      .type('text/html; charset=utf-8')
      .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>rs-tunnel Login Complete</title>
  </head>
  <body>
    <main style="max-width: 32rem; margin: 4rem auto; padding: 0 1rem; font-family: sans-serif; line-height: 1.5;">
      <h1 style="font-size: 1.5rem; margin-bottom: 0.75rem;">Login complete</h1>
      <p>You can return to your terminal. rs-tunnel will finish signing you in automatically.</p>
    </main>
  </body>
</html>`);
  });

  app.post(
    '/auth/slack/status',
    {
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      const parsed = authStatusRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new AppError(400, 'INVALID_INPUT', 'Invalid auth status request payload.', parsed.error.flatten());
      }

      return authStatusResponseSchema.parse(await app.services.authService.getSlackAuthStatus(parsed.data));
    },
  );

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
