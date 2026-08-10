import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!(await auth())?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const { script_content, file_name } = await request.json();
  const serviceUrl = process.env.CRAWLER_URL?.replace(/\/$/, '');
  if (!serviceUrl) {
    return NextResponse.json({ error: 'Crawler service (CRAWLER_URL) is not configured.' }, { status: 503 });
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = process.env.CRAWLER_SECRET;
  if (secret) headers['x-crawler-secret'] = secret;

  try {
    const res = await fetch(`${serviceUrl}/run-test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ script_content, file_name }),
      signal: AbortSignal.timeout(55000),
    });

    if (res.status === 429) {
      return NextResponse.json({ error: 'Crawler is at full capacity. Please try again in a moment.' }, { status: 429 });
    }

    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error || 'Test execution failed' }, { status: res.status });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Test execution failed' }, { status: 500 });
  }
}
