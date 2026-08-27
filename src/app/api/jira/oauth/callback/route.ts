import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

function getBaseUrl(request: Request) {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || new URL(request.url).origin).replace(/\/$/, '');
}

function settingsRedirect(baseUrl: string, name: string, value: string) {
  const target = new URL('/settings', baseUrl);
  target.searchParams.set('tab', 'integrations');
  target.searchParams.set(name, value);
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const session = await auth();
  const url = new URL(request.url);
  const baseUrl = getBaseUrl(request);
  const state = url.searchParams.get('state');
  const storedState = request.headers.get('cookie')
    ?.split('; ')
    .find((cookie) => cookie.startsWith('jira_oauth_state='))
    ?.slice('jira_oauth_state='.length);

  if (!session?.user?.email) return settingsRedirect(baseUrl, 'jira_oauth_error', 'Your SnapTest session expired. Please sign in again.');
  if (!state || !storedState || state !== decodeURIComponent(storedState)) {
    return settingsRedirect(baseUrl, 'jira_oauth_error', 'Invalid or expired Jira authorization request.');
  }

  const error = url.searchParams.get('error');
  if (error) return settingsRedirect(baseUrl, 'jira_oauth_error', url.searchParams.get('error_description') || error);

  const code = url.searchParams.get('code');
  const clientId = process.env.JIRA_CLIENT_ID;
  const clientSecret = process.env.JIRA_CLIENT_SECRET;
  if (!code) return settingsRedirect(baseUrl, 'jira_oauth_error', 'Atlassian did not return an authorization code.');
  if (!clientId || !clientSecret) return settingsRedirect(baseUrl, 'jira_oauth_error', 'Jira OAuth is not configured on the server.');

  try {
    const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${baseUrl}/api/jira/oauth/callback`,
      }),
      cache: 'no-store',
    });
    if (!tokenRes.ok) throw new Error('Atlassian rejected the authorization code.');

    const tokenData = await tokenRes.json();
    const accessToken = String(tokenData.access_token || '');
    if (!accessToken) throw new Error('Atlassian did not return an access token.');

    const resourcesRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!resourcesRes.ok) throw new Error('Could not load the authorized Jira workspace.');

    const resources = await resourcesRes.json();
    const resource = Array.isArray(resources) ? resources[0] : null;
    if (!resource?.id || !/^[A-Za-z0-9-]+$/.test(resource.id)) throw new Error('No Jira Cloud workspace was authorized.');

    const payload = JSON.stringify({
      auth_type: 'oauth2',
      access_token: accessToken,
      refresh_token: String(tokenData.refresh_token || ''),
      expires_at: Date.now() + Number(tokenData.expires_in || 3600) * 1000,
      cloud_id: resource.id,
      domain: String(resource.url || '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
      site_name: String(resource.name || resource.url || 'Jira Cloud'),
      connected_at: new Date().toISOString(),
    }).replace(/</g, '\\u003c');
    const destination = JSON.stringify('/settings?tab=integrations&jira_connected=true').replace(/</g, '\\u003c');

    const response = new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><title>Connecting Jira</title></head><body><p>Connecting Jira Cloud...</p><script type="application/json" id="jira-data">${payload}</script><script>const data=JSON.parse(document.getElementById('jira-data').textContent);const existing=JSON.parse(localStorage.getItem('jira_config')||'{}');localStorage.setItem('jira_config',JSON.stringify({...existing,...data,project_key:existing.project_key||''}));location.replace(${destination});</script></body></html>`, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      },
    });
    response.cookies.delete('jira_oauth_state');
    return response;
  } catch (error) {
    console.error('Jira OAuth callback failed:', error);
    return settingsRedirect(baseUrl, 'jira_oauth_error', error instanceof Error ? error.message : 'Jira authorization failed.');
  }
}
