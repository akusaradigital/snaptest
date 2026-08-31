import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validatedAxiosRequest } from '@/lib/outbound-url';

export async function POST(request: Request) {
  try {
    if (!(await auth())?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    const {
      auth_type,
      access_token,
      cloud_id,
      domain,
      email,
      token,
      project_key,
      query = '',
    } = await request.json();

    const isOAuth = auth_type === 'oauth2' && !!access_token;
    if (!isOAuth && (!domain || !email || !token)) {
      return NextResponse.json({ detail: 'Jira settings incomplete' }, { status: 400 });
    }

    let endpoint = '';
    const headers: Record<string, string> = { Accept: 'application/json' };

    const projectParam = project_key ? `&project=${encodeURIComponent(project_key.trim().toUpperCase())}` : '';
    const queryParam = query ? `&query=${encodeURIComponent(query.trim())}` : '';

    if (isOAuth) {
      if (!cloud_id || !/^[A-Za-z0-9-]+$/.test(cloud_id)) {
        return NextResponse.json({ detail: 'Invalid Jira OAuth workspace' }, { status: 400 });
      }
      endpoint = `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/user/assignable/search?maxResults=50${projectParam}${queryParam}`;
      headers['Authorization'] = `Bearer ${access_token.trim()}`;
    } else {
      const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const authHeader = Buffer.from(`${email.trim()}:${token.trim()}`).toString('base64');
      endpoint = `https://${cleanDomain}/rest/api/3/user/assignable/search?maxResults=50${projectParam}${queryParam}`;
      headers['Authorization'] = `Basic ${authHeader}`;
    }

    const res = await validatedAxiosRequest(endpoint, {
      method: 'GET',
      headers,
      timeout: 10000,
    });

    if (res.status >= 400) throw new Error('Failed to fetch Jira members');

    const users = Array.isArray(res.data)
      ? res.data
          .filter((u: any) => u.accountType === 'atlassian' || u.active !== false)
          .map((u: any) => ({
            accountId: u.accountId,
            displayName: u.displayName || u.emailAddress || 'User',
            emailAddress: u.emailAddress || '',
            avatarUrl: u.avatarUrls?.['24x24'] || u.avatarUrls?.['48x48'] || '',
            active: u.active !== false,
          }))
      : [];

    return NextResponse.json({ users });
  } catch (err: any) {
    console.error('Failed to fetch Jira assignable users:', err);
    return NextResponse.json({ users: [], detail: 'Could not fetch Jira users' }, { status: 200 });
  }
}
