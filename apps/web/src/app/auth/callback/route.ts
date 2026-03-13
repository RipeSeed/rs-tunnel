import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { ApiRequestError, exchangeAdminLoginCode } from '../../../lib/api';
import { getWebEnv } from '../../../lib/env';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminBrowserSession,
  encryptAdminBrowserSession,
  getAdminSessionCookieOptions,
} from '../../../lib/session';

function redirect(request: NextRequest, pathname: string): NextResponse {
  return NextResponse.redirect(new URL(pathname, request.url));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const loginCode = request.nextUrl.searchParams.get('loginCode');

  if (!loginCode) {
    return redirect(request, '/login?error=missing-login-code');
  }

  try {
    const tokenPair = await exchangeAdminLoginCode(loginCode);
    const browserSession = createAdminBrowserSession(tokenPair);
    const encodedSession = await encryptAdminBrowserSession(browserSession, getWebEnv().ADMIN_SESSION_SECRET);
    const response = redirect(request, '/');

    response.cookies.set(
      ADMIN_SESSION_COOKIE_NAME,
      encodedSession,
      getAdminSessionCookieOptions(getWebEnv().NODE_ENV === 'production'),
    );

    return response;
  } catch (error) {
    const response =
      error instanceof ApiRequestError && error.code === 'OWNER_ACCESS_REQUIRED'
        ? redirect(request, '/access-denied')
        : redirect(request, '/login?error=exchange-failed');

    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, '', {
      ...getAdminSessionCookieOptions(getWebEnv().NODE_ENV === 'production'),
      maxAge: 0,
    });

    return response;
  }
}
