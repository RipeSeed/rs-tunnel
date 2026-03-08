import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Env } from './config/env.js';
import { AppError, isAppError } from './lib/app-error.js';
import type { AuthService, TelemetryService, TokenService, TunnelService } from './types.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerTelemetryRoutes } from './routes/telemetry.js';
import { registerTunnelRoutes } from './routes/tunnels.js';

export type BuildAppInput = {
  env: Env;
  services: {
    authService: AuthService;
    telemetryService: TelemetryService;
    tunnelService: TunnelService;
    tokenService: TokenService;
  };
};

export function buildApp(input: BuildAppInput): FastifyInstance {
  const app = Fastify({
    logger: input.env.NODE_ENV !== 'test',
  });

  const readBearerToken = (authorization: string | undefined, missingMessage: string): string => {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new AppError(401, 'MISSING_AUTH', missingMessage);
    }

    return authorization.slice('Bearer '.length).trim();
  };

  app.decorate('services', input.services);

  app.decorate('authenticate', async (request) => {
    const token = readBearerToken(request.headers.authorization, 'Missing bearer access token.');
    request.auth = input.services.tokenService.verifyAccessToken(token);
  });

  app.decorate('authenticateTunnelRuntime', async (request) => {
    const token = readBearerToken(request.headers.authorization, 'Missing bearer tunnel runtime token.');
    request.tunnelRuntimeAuth = input.services.tokenService.verifyTunnelRunToken(token);
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
    await registerTelemetryRoutes(v1);
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
