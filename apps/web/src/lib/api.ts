import {
  adminActivityResponseSchema,
  adminBootstrapStatusSchema,
  adminDashboardSchema,
  adminSessionSchema,
  adminTunnelDetailResponseSchema,
  adminTunnelsListResponseSchema,
  adminUsersListResponseSchema,
  adminWebAuthExchangeRequestSchema,
  adminWebAuthStartResponseSchema,
  apiErrorSchema,
  refreshRequestSchema,
  tokenPairSchema,
  tunnelMetricsResponseSchema,
  tunnelRequestsResponseSchema,
  type TokenPair,
} from '@ripeseed/shared';

import { getWebEnv } from './env';
import { createAdminBrowserSession, type AdminBrowserSession } from './session';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST';
  bearerToken?: string;
  body?: unknown;
};

async function requestJson(path: string, options: RequestOptions = {}): Promise<unknown> {
  const { RS_TUNNEL_API_URL } = getWebEnv();
  const url = new URL(path, RS_TUNNEL_API_URL);

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.bearerToken ? { Authorization: `Bearer ${options.bearerToken}` } : {}),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : { message: await response.text() };

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiRequestError(response.status, parsed.data.code, parsed.data.message, parsed.data.details);
    }

    throw new ApiRequestError(response.status, 'HTTP_ERROR', `Request failed with status ${response.status}`);
  }

  return payload;
}

export async function getAdminBootstrapStatus() {
  return adminBootstrapStatusSchema.parse(await requestJson('/v1/admin/bootstrap'));
}

export async function startAdminSlackAuth() {
  return adminWebAuthStartResponseSchema.parse(
    await requestJson('/v1/admin/auth/slack/start', {
      method: 'POST',
    }),
  );
}

export async function exchangeAdminLoginCode(loginCode: string) {
  return tokenPairSchema.parse(
    await requestJson('/v1/admin/auth/exchange', {
      method: 'POST',
      body: adminWebAuthExchangeRequestSchema.parse({ loginCode }),
    }),
  );
}

export async function refreshAdminTokens(refreshToken: string): Promise<TokenPair> {
  return tokenPairSchema.parse(
    await requestJson('/v1/auth/refresh', {
      method: 'POST',
      body: refreshRequestSchema.parse({ refreshToken }),
    }),
  );
}

export async function logoutAdminSession(input: { accessToken: string; refreshToken: string }): Promise<void> {
  await requestJson('/v1/auth/logout', {
    method: 'POST',
    bearerToken: input.accessToken,
    body: {
      refreshToken: input.refreshToken,
    },
  });
}

export async function getAdminSession(accessToken: string) {
  return adminSessionSchema.parse(
    await requestJson('/v1/admin/session', {
      bearerToken: accessToken,
    }),
  );
}

export async function getAdminDashboard(accessToken: string) {
  return adminDashboardSchema.parse(
    await requestJson('/v1/admin/dashboard', {
      bearerToken: accessToken,
    }),
  );
}

export async function listAdminUsers(accessToken: string) {
  return adminUsersListResponseSchema.parse(
    await requestJson('/v1/admin/users', {
      bearerToken: accessToken,
    }),
  );
}

export async function listAdminTunnels(accessToken: string) {
  return adminTunnelsListResponseSchema.parse(
    await requestJson('/v1/admin/tunnels', {
      bearerToken: accessToken,
    }),
  );
}

export async function getAdminTunnelDetail(accessToken: string, tunnelId: string) {
  return adminTunnelDetailResponseSchema.parse(
    await requestJson(`/v1/admin/tunnels/${encodeURIComponent(tunnelId)}`, {
      bearerToken: accessToken,
    }),
  );
}

export async function getAdminTunnelMetrics(accessToken: string, tunnelId: string, from: string, to: string) {
  const searchParams = new URLSearchParams({ from, to });
  return tunnelMetricsResponseSchema.parse(
    await requestJson(`/v1/admin/tunnels/${encodeURIComponent(tunnelId)}/metrics?${searchParams.toString()}`, {
      bearerToken: accessToken,
    }),
  );
}

export async function getAdminTunnelRequests(accessToken: string, tunnelId: string, after?: string, limit = 100) {
  const searchParams = new URLSearchParams({ limit: String(limit) });
  if (after) {
    searchParams.set('after', after);
  }

  return tunnelRequestsResponseSchema.parse(
    await requestJson(`/v1/admin/tunnels/${encodeURIComponent(tunnelId)}/requests?${searchParams.toString()}`, {
      bearerToken: accessToken,
    }),
  );
}

export async function listAdminActivity(accessToken: string, limit = 50) {
  return adminActivityResponseSchema.parse(
    await requestJson(`/v1/admin/activity?limit=${encodeURIComponent(String(limit))}`, {
      bearerToken: accessToken,
    }),
  );
}

export async function requestWithRefresh<T>(input: {
  session: AdminBrowserSession;
  request: (accessToken: string) => Promise<T>;
  refresh?: (refreshToken: string) => Promise<TokenPair>;
}): Promise<{ data: T; session: AdminBrowserSession }> {
  try {
    return {
      data: await input.request(input.session.accessToken),
      session: input.session,
    };
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 401 || !input.refresh) {
      throw error;
    }

    const refreshed = await input.refresh(input.session.refreshToken);
    const nextSession = createAdminBrowserSession(refreshed);

    return {
      data: await input.request(nextSession.accessToken),
      session: nextSession,
    };
  }
}
