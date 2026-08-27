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

  const clientId = process.env.JIRA_CLIENT_ID;
  if (!clientId) return NextResponse.json({ detail: 'Jira OAuth is not configured' }, { status: 500 });

  const nonce = randomBytes(32).toString('base64url');
  const redirectUri = `${getBaseUrl(request)}/api/jira/oauth/callback`;
  const authUrl = new URL('https://auth.atlassian.com/authorize');
  authUrl.searchParams.set('audience', 'api.atlassian.com');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('scope', 'read:jira-work write:jira-work read:jira-user read:me offline_access');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', nonce);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('prompt', 'consent');

  const response = NextResponse.redirect(authUrl);
  response.cookies.set('jira_oauth_state', nonce, {
    httpOnly: true,
    secure: redirectUri.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/jira/oauth/callback',
    maxAge: 600,
  });
  return response;
}
