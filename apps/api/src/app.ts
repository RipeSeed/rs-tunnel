import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Env } from './config/env.js';
import { AppError, isAppError } from './lib/app-error.js';
import type { AuthService, TokenService, TunnelService } from './types.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerTunnelRoutes } from './routes/tunnels.js';

export type BuildAppInput = {
  env: Env;
  services: {
    authService: AuthService;
    tunnelService: TunnelService;
    tokenService: TokenService;
  };
};

export function buildApp(input: BuildAppInput): FastifyInstance {
  const app = Fastify({
    logger: input.env.NODE_ENV !== 'test',
  });

  app.decorate('services', input.services);

  app.decorate('authenticate', async (request, _reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'MISSING_AUTH', 'Missing bearer access token.');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    request.auth = input.services.tokenService.verifyAccessToken(token);
  });

  app.register(cors, { origin: true });
  app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  });

  app.get('/healthz', async () => ({ ok: true }));

  app.register(async (v1) => {
    await registerAuthRoutes(v1);
    await registerTunnelRoutes(v1);
  }, { prefix: '/v1' });

  app.setErrorHandler((error, request, reply) => {
    if (isAppError(error)) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    request.log.error(error);

    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error',
    });
  });

  return app;
}
