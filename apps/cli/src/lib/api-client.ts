import {
  apiErrorSchema,
  authExchangeRequestSchema,
  authStartRequestSchema,
  authStartResponseSchema,
  heartbeatResponseSchema,
  refreshRequestSchema,
  tokenPairSchema,
  tunnelCreateRequestSchema,
  tunnelCreateResponseSchema,
  tunnelListResponseSchema,
  tunnelTelemetryIngestRequestSchema,
  tunnelTelemetryIngestResponseSchema,
} from '@ripeseed/shared';
import type { TunnelTelemetryIngestRequest } from '@ripeseed/shared';

function formatNetworkFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'unknown network error';
  }

  const cause = error.cause;
  if (!cause || typeof cause !== 'object') {
    return error.message;
  }

  const code = typeof (cause as { code?: unknown }).code === 'string' ? (cause as { code: string }).code : undefined;
  const message =
    typeof (cause as { message?: unknown }).message === 'string'
      ? (cause as { message: string }).message
      : error.message;

  return code ? `${code}: ${message}` : message;
}

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

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`);
      return response.ok;
    } catch {
      return false;
    }
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
      bearerToken: accessToken,
      body: {
        refreshToken,
      },
    });
  }

  async createTunnel(
    accessToken: string,
    input: { port: number; requestedSlug?: string },
  ): Promise<{
    tunnelId: string;
    hostname: string;
    cloudflaredToken: string;
    tunnelRunToken: string;
    heartbeatIntervalSec: number;
    leaseTimeoutSec: number;
  }> {
    const body = tunnelCreateRequestSchema.parse(input);
    const response = await this.request('/v1/tunnels', {
      method: 'POST',
      bearerToken: accessToken,
      body,
    });

    return tunnelCreateResponseSchema.parse(response);
  }

  async listTunnels(accessToken: string) {
    const response = await this.request('/v1/tunnels', {
      method: 'GET',
      bearerToken: accessToken,
    });

    return tunnelListResponseSchema.parse(response);
  }

  async heartbeat(tunnelRunToken: string, tunnelId: string): Promise<{ expiresAt: string }> {
    const response = await this.request(`/v1/tunnels/${encodeURIComponent(tunnelId)}/heartbeat`, {
      method: 'POST',
      bearerToken: tunnelRunToken,
    });

    const parsed = heartbeatResponseSchema.parse(response);
    return { expiresAt: parsed.expiresAt };
  }

  async ingestTelemetry(
    tunnelRunToken: string,
    tunnelId: string,
    input: TunnelTelemetryIngestRequest,
  ): Promise<void> {
    const body = tunnelTelemetryIngestRequestSchema.parse(input);
    const response = await this.request(`/v1/tunnels/${encodeURIComponent(tunnelId)}/telemetry`, {
      method: 'POST',
      bearerToken: tunnelRunToken,
      body,
    });

    tunnelTelemetryIngestResponseSchema.parse(response);
  }

  async stopTunnel(accessToken: string, tunnelIdOrHostname: string): Promise<void> {
    await this.request(`/v1/tunnels/${encodeURIComponent(tunnelIdOrHostname)}`, {
      method: 'DELETE',
      bearerToken: accessToken,
    });
  }

  private async request(
    path: string,
    init: {
      method: string;
      bearerToken?: string;
      body?: unknown;
    },
  ): Promise<unknown> {
    let response: Response;
    try {
      const headers: Record<string, string> = {
        ...(init.bearerToken ? { Authorization: `Bearer ${init.bearerToken}` } : {}),
      };

      if (init.body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      response = await fetch(`${this.baseUrl}${path}`, {
        method: init.method,
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch (error) {
      const networkFailure = formatNetworkFailure(error);
      throw new ApiClientError(
        0,
        'NETWORK_ERROR',
        `Unable to reach API at ${this.baseUrl} (${networkFailure}). Verify /healthz from this shell, or run the command with --domain <url>.`,
      );
    }

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
