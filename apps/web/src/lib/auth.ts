import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AdminSession } from '@ripeseed/shared';

import { ApiRequestError, getAdminSession } from './api';
import { getWebEnv } from './env';
import { ADMIN_SESSION_COOKIE_NAME, decryptAdminBrowserSession, type AdminBrowserSession } from './session';

export type ProtectedAdminState =
  | {
      kind: 'authorized';
      browserSession: AdminBrowserSession;
      adminSession: AdminSession;
    }
  | {
      kind: 'redirect';
      location: '/login' | '/access-denied';
    };

export async function readAdminBrowserSession(): Promise<AdminBrowserSession | null> {
  const cookieStore = await cookies();
  const encodedSession = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (!encodedSession) {
    return null;
  }

  return decryptAdminBrowserSession(encodedSession, getWebEnv().ADMIN_SESSION_SECRET);
}

export async function resolveProtectedAdminState(
  browserSession: AdminBrowserSession | null,
  loadAdminSession: (accessToken: string) => Promise<AdminSession> = getAdminSession,
): Promise<ProtectedAdminState> {
  if (!browserSession) {
    return {
      kind: 'redirect',
      location: '/login',
    };
  }

  try {
    const adminSession = await loadAdminSession(browserSession.accessToken);

    return {
      kind: 'authorized',
      browserSession,
      adminSession,
    };
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'OWNER_ACCESS_REQUIRED') {
      return {
        kind: 'redirect',
        location: '/access-denied',
      };
    }

    if (error instanceof ApiRequestError && error.status === 401) {
      return {
        kind: 'redirect',
        location: '/login',
      };
    }

    throw error;
  }
}

export async function requireProtectedAdminState(): Promise<Extract<ProtectedAdminState, { kind: 'authorized' }>> {
  const state = await resolveProtectedAdminState(await readAdminBrowserSession());
  if (state.kind === 'redirect') {
    redirect(state.location);
  }

  return state;
}
