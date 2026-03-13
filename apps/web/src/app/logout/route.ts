import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { logoutAdminSession } from '../../lib/api';
import { getWebEnv } from '../../lib/env';
import {
  ADMIN_SESSION_COOKIE_NAME,
  decryptAdminBrowserSession,
  getAdminSessionCookieOptions,
} from '../../lib/session';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const encodedSession = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (encodedSession) {
    const session = await decryptAdminBrowserSession(encodedSession, getWebEnv().ADMIN_SESSION_SECRET);
    if (session) {
      await logoutAdminSession({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      }).catch(() => undefined);
    }
  }

  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, '', {
    ...getAdminSessionCookieOptions(getWebEnv().NODE_ENV === 'production'),
    maxAge: 0,
  });

  return response;
}
