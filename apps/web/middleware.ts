import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { refreshAdminTokens } from './src/lib/api';
import { getWebEnv } from './src/lib/env';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminBrowserSession,
  decryptAdminBrowserSession,
  encryptAdminBrowserSession,
  getAdminSessionCookieOptions,
  isSessionExpiring,
} from './src/lib/session';

function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/access-denied' ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/api/auth/slack/start')
  );
}

async function withClearedSessionCookie(response: NextResponse): Promise<NextResponse> {
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, '', {
    ...getAdminSessionCookieOptions(getWebEnv().NODE_ENV === 'production'),
    maxAge: 0,
  });

  return response;
}

async function withSessionCookie(response: NextResponse, sessionValue: string): Promise<NextResponse> {
  response.cookies.set(
    ADMIN_SESSION_COOKIE_NAME,
    sessionValue,
    getAdminSessionCookieOptions(getWebEnv().NODE_ENV === 'production'),
  );

  return response;
}

function redirect(request: NextRequest, pathname: string): NextResponse {
  return NextResponse.redirect(new URL(pathname, request.url));
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const publicPath = isPublicPath(pathname);
  const encodedSession = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (!encodedSession) {
    return publicPath ? NextResponse.next() : redirect(request, '/login');
  }

  const secret = getWebEnv().ADMIN_SESSION_SECRET;
  const parsedSession = await decryptAdminBrowserSession(encodedSession, secret);

  if (!parsedSession) {
    const response = publicPath ? NextResponse.next() : redirect(request, '/login');
    return withClearedSessionCookie(response);
  }

  let activeSession = parsedSession;
  let refreshedCookieValue: string | null = null;

  if (isSessionExpiring(activeSession)) {
    try {
      const refreshedTokens = await refreshAdminTokens(activeSession.refreshToken);
      activeSession = createAdminBrowserSession(refreshedTokens);
      refreshedCookieValue = await encryptAdminBrowserSession(activeSession, secret);
    } catch {
      const response = publicPath ? NextResponse.next() : redirect(request, '/login');
      return withClearedSessionCookie(response);
    }
  }

  const response = publicPath && pathname === '/login' ? redirect(request, '/') : NextResponse.next();

  if (refreshedCookieValue) {
    return withSessionCookie(response, refreshedCookieValue);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
