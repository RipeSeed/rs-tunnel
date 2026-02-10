import type { Env } from '../config/env.js';
import { AppError } from '../lib/app-error.js';

type CloudflareApiResponse<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ code: number; message: string }>;
};

type DeletionResult = 
  | { success: true }
  | { success: false; reason: 'not_found' | 'active_connections' | 'error'; message?: string };

export class CloudflareService {
  constructor(private readonly env: Env) {}

  private get baseUrl(): string {
    return 'https://api.cloudflare.com/client/v4';
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    options?: { allowNotFound?: boolean },
  ): Promise<T | undefined> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    const payload = (await response.json()) as CloudflareApiResponse<T>;

    if (!response.ok || !payload.success) {
      const firstError = payload.errors?.[0];
      const isNotFound = response.status === 404 || firstError?.code === 7003;
      if (options?.allowNotFound && isNotFound) {
        return undefined;
      }

      throw new AppError(502, 'CLOUDFLARE_ERROR', firstError?.message ?? 'Cloudflare API request failed.', {
        path,
        status: response.status,
        errors: payload.errors,
      });
    }

    return payload.result;
  }

  async createTunnel(name: string): Promise<{ id: string }> {
    const result = await this.request<{ id: string }>(
      `/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel`,
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          config_src: 'cloudflare',
        }),
      },
    );

    if (!result) {
      throw new AppError(502, 'CLOUDFLARE_ERROR', 'Tunnel creation returned no result.');
    }

    return result;
  }

  async getTunnelToken(tunnelId: string): Promise<string> {
    const result = await this.request<{ token?: string } | string>(
      `/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${tunnelId}/token`,
      {
        method: 'GET',
      },
    );

    if (!result) {
      throw new AppError(502, 'CLOUDFLARE_ERROR', 'Tunnel token response was empty.');
    }

    if (typeof result === 'string') {
      return result;
    }

    if (!result.token) {
      throw new AppError(502, 'CLOUDFLARE_ERROR', 'Tunnel token missing in Cloudflare response.');
    }

    return result.token;
  }

  async configureTunnel(input: { tunnelId: string; hostname: string; port: number }): Promise<void> {
    await this.request(
      `/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${input.tunnelId}/configurations`,
      {
        method: 'PUT',
        body: JSON.stringify({
          config: {
            ingress: [
              {
                hostname: input.hostname,
                service: `http://localhost:${input.port}`,
              },
              { service: 'http_status:404' },
            ],
            'warp-routing': {
              enabled: false,
            },
          },
        }),
      },
    );
  }

  async createDnsRecord(hostname: string, tunnelId: string): Promise<string> {
    const result = await this.request<{ id: string }>(`/zones/${this.env.CLOUDFLARE_ZONE_ID}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'CNAME',
        proxied: true,
        name: hostname,
        content: `${tunnelId}.cfargotunnel.com`,
      }),
    });

    if (!result?.id) {
      throw new AppError(502, 'CLOUDFLARE_ERROR', 'DNS creation returned no record id.');
    }

    return result.id;
  }

  async deleteDnsRecord(recordId: string): Promise<void> {
    await this.request(
      `/zones/${this.env.CLOUDFLARE_ZONE_ID}/dns_records/${recordId}`,
      {
        method: 'DELETE',
      },
      { allowNotFound: true },
    );
  }

  async deleteTunnel(tunnelId: string): Promise<void> {
    await this.request(
      `/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${tunnelId}`,
      {
        method: 'DELETE',
      },
      { allowNotFound: true },
    );
  }

  async deleteTunnelWithRetry(tunnelId: string, maxAttempts = 5): Promise<DeletionResult> {
    const BASE_DELAY_MS = 1000;
    const MAX_DELAY_MS = 10000;

    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
      try {
        await this.request(
          `/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${tunnelId}`,
          {
            method: 'DELETE',
          },
          { allowNotFound: true },
        );
        return { success: true };
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== 'CLOUDFLARE_ERROR') {
          return { success: false, reason: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
        }

        const errorCode = (error.details as { errors?: Array<{ code: number }> })?.errors?.[0]?.code;
        
        if (errorCode === 1000) {
          if (attemptNumber < maxAttempts) {
            const delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attemptNumber - 1), MAX_DELAY_MS);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
          return { success: false, reason: 'active_connections' };
        }

        return { success: false, reason: 'error', message: error.message };
      }
    }

    return { success: false, reason: 'active_connections' };
  }
}
