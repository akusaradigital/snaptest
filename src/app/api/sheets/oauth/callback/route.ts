import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

function getBaseUrl(request: Request) {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || new URL(request.url).origin).replace(/\/$/, '');
}

function errorRedirect(baseUrl: string, returnUrl: string, errorMsg: string) {
  const target = new URL(returnUrl.startsWith('/') ? returnUrl : '/settings?tab=integrations', baseUrl);
  target.searchParams.set('sheets_oauth_error', errorMsg);
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const session = await auth();
  const url = new URL(request.url);
  const baseUrl = getBaseUrl(request);

  let returnUrl = '/settings?tab=integrations';
  let nonce = '';

  const rawState = url.searchParams.get('state');
  if (rawState) {
    try {
      const parsed = JSON.parse(Buffer.from(rawState, 'base64url').toString('utf8'));
      nonce = parsed.nonce || '';
      returnUrl = parsed.returnUrl || returnUrl;
    } catch {}
  }

  const storedNonce = request.headers.get('cookie')
    ?.split('; ')
    .find((cookie) => cookie.startsWith('sheets_oauth_nonce='))
    ?.slice('sheets_oauth_nonce='.length);

  if (!session?.user?.email) {
    return errorRedirect(baseUrl, returnUrl, 'Your SnapTest session expired. Please sign in again.');
  }

  if (!nonce || !storedNonce || nonce !== storedNonce) {
    return errorRedirect(baseUrl, returnUrl, 'Invalid or expired Google authorization request.');
  }

  const error = url.searchParams.get('error');
  if (error) {
    return errorRedirect(baseUrl, returnUrl, url.searchParams.get('error_description') || error);
  }

  const code = url.searchParams.get('code');
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!code) return errorRedirect(baseUrl, returnUrl, 'Google did not return an authorization code.');
  if (!clientId || !clientSecret) return errorRedirect(baseUrl, returnUrl, 'Google OAuth credentials not configured on server.');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${baseUrl}/api/sheets/oauth/callback`,
        grant_type: 'authorization_code',
      }).toString(),
      cache: 'no-store',
    });

    if (!tokenRes.ok) {
      const errData = await tokenRes.json().catch(() => ({}));
      throw new Error(errData.error_description || 'Google rejected the authorization code.');
    }

    const tokenData = await tokenRes.json();
    const accessToken = String(tokenData.access_token || '');
    if (!accessToken) throw new Error('Google did not return an access token.');

    // Fetch user profile from Google for display
    let userEmail = session.user.email;
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (userRes.ok) {
        const u = await userRes.json();
        if (u.email) userEmail = u.email;
      }
    } catch {}

    const payload = JSON.stringify({
      auth_type: 'oauth2',
      access_token: accessToken,
      refresh_token: tokenData.refresh_token || '',
      expires_at: Date.now() + (Number(tokenData.expires_in) || 3600) * 1000,
      google_email: userEmail,
      connected_at: new Date().toISOString(),
    }).replace(/</g, '\\u003c');

    const destUrl = new URL(returnUrl.startsWith('/') ? returnUrl : '/settings?tab=integrations', baseUrl);
    destUrl.searchParams.set('sheets_connected', 'true');
    const destination = JSON.stringify(destUrl.pathname + destUrl.search).replace(/</g, '\\u003c');

    const response = new NextResponse(
      `<!doctype html><html><head><meta charset="utf-8"><title>Connecting Google Sheets</title></head><body><p>Connecting Google Sheets...</p><script type="application/json" id="sheets-data">${payload}</script><script>const data=JSON.parse(document.getElementById('sheets-data').textContent);const existing=JSON.parse(localStorage.getItem('sheets_config')||'{}');localStorage.setItem('sheets_config',JSON.stringify({...existing,...data}));location.replace(${destination});</script></body></html>`,
      {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        },
      }
    );
    response.cookies.delete('sheets_oauth_nonce');
    return response;
  } catch (err: any) {
    console.error('Google Sheets OAuth callback failed:', err);
    return errorRedirect(baseUrl, returnUrl, err.message || 'Google authorization failed.');
  }
}
