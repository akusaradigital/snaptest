import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validatedAxiosRequest } from '@/lib/outbound-url';

export async function POST(request: Request) {
  try {
    if (!(await auth())?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    const { auth_type, access_token, cloud_id, domain, email, token } = await request.json();

    const isOAuth = auth_type === 'oauth2' && !!access_token;
    if (!isOAuth && (!domain || !email || !token)) {
      return NextResponse.json({ detail: 'Domain, email, and API token are required' }, { status: 400 });
    }

    let url = '';
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (isOAuth) {
      if (!cloud_id || !/^[A-Za-z0-9-]+$/.test(cloud_id)) {
        return NextResponse.json({ detail: 'Jira OAuth workspace is invalid. Reconnect Jira in Settings.' }, { status: 400 });
      }
      url = `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/myself`;
      headers['Authorization'] = `Bearer ${access_token.trim()}`;
    } else {
      const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const authHeader = Buffer.from(`${email.trim()}:${token.trim()}`).toString('base64');
      url = `https://${cleanDomain}/rest/api/3/myself`;
      headers['Authorization'] = `Basic ${authHeader}`;
    }

    const res = await validatedAxiosRequest(url, {
      method: 'GET',
      headers,
      timeout: 10000,
    });
    if (res.status >= 400) throw new Error('Jira rejected the request');

    return NextResponse.json({
      valid: true,
      displayName: res.data.displayName || res.data.emailAddress || 'Jira User',
    });
  } catch (err) {
    console.error('Jira connection test failed:', err);
    return NextResponse.json({ valid: false, detail: 'Failed to connect to Jira' }, { status: 400 });
  }
}
