import { NextResponse } from 'next/server';

import { startAdminSlackAuth } from '../../../../../lib/api';

export async function GET(): Promise<NextResponse> {
  const { authorizeUrl } = await startAdminSlackAuth();
  return NextResponse.redirect(authorizeUrl);
}
