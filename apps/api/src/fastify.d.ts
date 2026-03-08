import type { FastifyReply } from 'fastify';

import type {
  AccessTokenPayload,
  AuthService,
  RuntimeTunnelTokenPayload,
  TelemetryService,
  TokenService,
  TunnelService,
} from './types.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AccessTokenPayload;
    tunnelRuntimeAuth?: RuntimeTunnelTokenPayload;
  }

  interface FastifyInstance {
    services: {
      authService: AuthService;
      telemetryService: TelemetryService;
      tunnelService: TunnelService;
      tokenService: TokenService;
    };
    authenticate: (
      request: import('fastify').FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    authenticateTunnelRuntime: (
      request: import('fastify').FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}
