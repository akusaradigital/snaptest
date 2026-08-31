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
      issue_key,
    } = await request.json();

    if (!issue_key) {
      return NextResponse.json({ detail: 'issue_key is required' }, { status: 400 });
    }

    const isOAuth = auth_type === 'oauth2' && !!access_token;
    if (!isOAuth && (!domain || !email || !token)) {
      return NextResponse.json({ detail: 'Jira configuration incomplete' }, { status: 400 });
    }

    let endpoint = '';
    const headers: Record<string, string> = { Accept: 'application/json' };
    const cleanKey = String(issue_key).trim().toUpperCase();

    if (isOAuth) {
      if (!cloud_id || !/^[A-Za-z0-9-]+$/.test(cloud_id)) {
        return NextResponse.json({ detail: 'Invalid Jira OAuth workspace' }, { status: 400 });
      }
      endpoint = `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/issue/${cleanKey}?fields=status,assignee,summary,updated`;
      headers['Authorization'] = `Bearer ${access_token.trim()}`;
    } else {
      const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const authHeader = Buffer.from(`${email.trim()}:${token.trim()}`).toString('base64');
      endpoint = `https://${cleanDomain}/rest/api/3/issue/${cleanKey}?fields=status,assignee,summary,updated`;
      headers['Authorization'] = `Basic ${authHeader}`;
    }

    const res = await validatedAxiosRequest(endpoint, {
      method: 'GET',
      headers,
      timeout: 10000,
    });

    if (res.status >= 400) throw new Error('Failed to fetch Jira status');

    const fields = res.data?.fields || {};
    const statusObj = fields.status || {};
    const assigneeObj = fields.assignee || {};

    return NextResponse.json({
      success: true,
      issue_key: cleanKey,
      status: statusObj.name || 'Unknown',
      status_category: statusObj.statusCategory?.key || 'indeterminate',
      assignee_name: assigneeObj.displayName || null,
      assignee_avatar: assigneeObj.avatarUrls?.['24x24'] || null,
      updated_at: fields.updated || null,
    });
  } catch (err: any) {
    console.error('Failed to sync Jira status:', err);
    return NextResponse.json({ detail: 'Could not fetch Jira status' }, { status: 400 });
  }
}
