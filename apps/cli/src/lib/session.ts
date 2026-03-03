import type { StoredSession } from '../types.js';
import { clearSession, loadSession, saveSession } from '../store/credentials.js';
import { ApiClient, ApiClientError } from './api-client.js';

const REFRESH_HEADROOM_SEC = 30;

function isExpired(session: StoredSession): boolean {
  return session.expiresAtEpochSec <= Math.floor(Date.now() / 1000) + REFRESH_HEADROOM_SEC;
}

async function refreshSession(apiClient: ApiClient, session: StoredSession): Promise<StoredSession> {
  const refreshed = await apiClient.refreshTokens(session.refreshToken);

  const next: StoredSession = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAtEpochSec: Math.floor(Date.now() / 1000) + refreshed.expiresInSec,
    profile: refreshed.profile,
  };

  await saveSession(next);
  return next;
}

export async function requireSession(apiClient: ApiClient): Promise<StoredSession> {
  const session = await loadSession();
  if (!session) {
    throw new Error('Not logged in. Run: rs-tunnel login --email <you@example.com>');
  }

  if (isExpired(session)) {
    try {
      return await refreshSession(apiClient, session);
    } catch {
      await clearSession();
      throw new Error('Session expired. Please login again.');
    }
  }

  return session;
}

export async function withAuthenticatedSession<T>(
  apiClient: ApiClient,
  run: (session: StoredSession) => Promise<T>,
): Promise<T> {
  let session = await requireSession(apiClient);

  try {
    return await run(session);
  } catch (error) {
    if (!(error instanceof ApiClientError) || error.status !== 401) {
      throw error;
    }

    session = await refreshSession(apiClient, session);
    return run(session);
  }
}
