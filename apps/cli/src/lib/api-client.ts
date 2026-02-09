import {
  apiErrorSchema,
  authExchangeRequestSchema,
  authStartRequestSchema,
  authStartResponseSchema,
  refreshRequestSchema,
  tokenPairSchema,
  tunnelCreateRequestSchema,
  tunnelCreateResponseSchema,
} from '@ripeseed/shared';
import { z } from 'zod';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

const listTunnelSchema = z.array(
  z.object({
    id: z.string(),
    hostname: z.string(),
    slug: z.string(),
    status: z.string(),
    requestedPort: z.number(),
    createdAt: z.string(),
  }),
);

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async health(): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/healthz`);
    return response.ok;
  }

  async startSlackAuth(input: { email: string; codeChallenge: string; cliCallbackUrl: string }): Promise<{
    authorizeUrl: string;
    state: string;
  }> {
    const body = authStartRequestSchema.parse(input);
    const response = await this.request('/v1/auth/slack/start', {
      method: 'POST',
      body,
    });

    return authStartResponseSchema.parse(response);
  }

  async exchangeLoginCode(input: { loginCode: string; codeVerifier: string }) {
    const body = authExchangeRequestSchema.parse(input);
    const response = await this.request('/v1/auth/exchange', {
      method: 'POST',
      body,
    });

    return tokenPairSchema.parse(response);
  }

  async refreshTokens(refreshToken: string) {
    const body = refreshRequestSchema.parse({ refreshToken });
    const response = await this.request('/v1/auth/refresh', {
      method: 'POST',
      body,
    });

    return tokenPairSchema.parse(response);
  }

  async logout(accessToken: string, refreshToken?: string): Promise<void> {
    await this.request('/v1/auth/logout', {
      method: 'POST',
      accessToken,
      body: {
        refreshToken,
      },
    });
  }

  async createTunnel(accessToken: string, input: { port: number; requestedSlug?: string }) {
    const body = tunnelCreateRequestSchema.parse(input);
    const response = await this.request('/v1/tunnels', {
      method: 'POST',
      accessToken,
      body,
    });

    return tunnelCreateResponseSchema.parse(response);
  }

  async listTunnels(accessToken: string) {
    const response = await this.request('/v1/tunnels', {
      method: 'GET',
      accessToken,
    });

    return listTunnelSchema.parse(response);
  }

  async heartbeat(accessToken: string, tunnelIdOrHostname: string): Promise<{ expiresAt: string }> {
    const response = await this.request(`/v1/tunnels/${encodeURIComponent(tunnelIdOrHostname)}/heartbeat`, {
      method: 'POST',
      accessToken,
    });

    return z.object({ ok: z.literal(true), expiresAt: z.string() }).parse(response);
  }

  async stopTunnel(accessToken: string, tunnelIdOrHostname: string): Promise<void> {
    await this.request(`/v1/tunnels/${encodeURIComponent(tunnelIdOrHostname)}`, {
      method: 'DELETE',
      accessToken,
    });
  }

  private async request(
    path: string,
    init: {
      method: string;
      accessToken?: string;
      body?: unknown;
    },
  ): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: init.method,
      headers: {
        'Content-Type': 'application/json',
        ...(init.accessToken ? { Authorization: `Bearer ${init.accessToken}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    if (response.status === 204) {
      return {};
    }

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : { message: await response.text() };

    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(payload);
      if (parsed.success) {
        throw new ApiClientError(response.status, parsed.data.code, parsed.data.message, parsed.data.details);
      }

      throw new ApiClientError(response.status, 'HTTP_ERROR', `Request failed with status ${response.status}`);
    }

    return payload;
  }
}
