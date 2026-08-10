import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validatedAxiosRequest } from '@/lib/outbound-url';

export async function POST(request: Request) {
  try {
    if (!(await auth())?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    const { domain, email, token } = await request.json();

    if (!domain || !email || !token) {
      return NextResponse.json({ detail: 'Domain, email, and API token are required' }, { status: 400 });
    }

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const authHeader = Buffer.from(`${email.trim()}:${token.trim()}`).toString('base64');

    const res = await validatedAxiosRequest(`https://${cleanDomain}/rest/api/3/myself`, {
      method: 'GET',
      headers: { Authorization: `Basic ${authHeader}`, Accept: 'application/json' },
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
