import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function POST(request: Request) {
  if (!(await auth())?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const clientId = process.env.JIRA_CLIENT_ID;
  const clientSecret = process.env.JIRA_CLIENT_SECRET;
  const { refresh_token } = await request.json();
  if (!clientId || !clientSecret) return NextResponse.json({ detail: 'Jira OAuth is not configured' }, { status: 500 });
  if (!refresh_token || typeof refresh_token !== 'string') return NextResponse.json({ detail: 'Reconnect Jira to continue' }, { status: 400 });

  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token,
    }),
    cache: 'no-store',
  });
  if (!response.ok) return NextResponse.json({ detail: 'Jira authorization expired. Reconnect Jira in Settings.' }, { status: 401 });

  const data = await response.json();
  return NextResponse.json({
    access_token: data.access_token,
    refresh_token: data.refresh_token || refresh_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
  });
}
