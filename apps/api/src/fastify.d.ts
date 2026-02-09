import type { FastifyReply } from 'fastify';

import type { AccessTokenPayload, AuthService, TokenService, TunnelService } from './types.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AccessTokenPayload;
  }

  interface FastifyInstance {
    services: {
      authService: AuthService;
      tunnelService: TunnelService;
      tokenService: TokenService;
    };
    authenticate: (
      request: import('fastify').FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}
