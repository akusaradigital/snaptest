import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

function getBaseUrl(request: Request) {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || new URL(request.url).origin).replace(/\/$/, '');
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const clientId = process.env.AUTH_GOOGLE_ID;
  if (!clientId) return NextResponse.json({ detail: 'Google OAuth is not configured on server' }, { status: 500 });

  const url = new URL(request.url);
  const returnUrl = url.searchParams.get('return_url') || '/settings?tab=integrations';
  const nonce = randomBytes(24).toString('base64url');
  const statePayload = Buffer.from(JSON.stringify({ nonce, returnUrl })).toString('base64url');

  const redirectUri = `${getBaseUrl(request)}/api/sheets/oauth/callback`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', statePayload);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set('sheets_oauth_nonce', nonce, {
    httpOnly: true,
    secure: redirectUri.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/sheets/oauth/callback',
    maxAge: 600,
  });
  return response;
}
