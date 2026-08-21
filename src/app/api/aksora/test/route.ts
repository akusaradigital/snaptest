import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validatedAxiosRequest } from '@/lib/outbound-url';

export async function POST(request: Request) {
  try {
    if (!(await auth())?.user?.email) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { url, apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ detail: 'Aksora API Key is required' }, { status: 400 });
    }
    if (!url) {
      return NextResponse.json({ detail: 'Aksora Base URL is required' }, { status: 400 });
    }
    try { new URL(url); } catch { return NextResponse.json({ detail: 'Invalid Aksora Base URL format' }, { status: 400 }); }

    const baseUrl = url.replace(/\/$/, '');
    const testEndpoint = `${baseUrl}/api/public/v1/bugs`;

    const res = await validatedAxiosRequest(testEndpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        Accept: 'application/json',
      },
      timeout: 10000,
    }, { allowLocalhost: process.env.NODE_ENV !== 'production' });

    if (res.status === 200) {
      return NextResponse.json({
        valid: true,
        message: 'Successfully connected to Aksora API',
      });
    } else {
      return NextResponse.json({
        valid: false,
        detail: 'Invalid response from Aksora API',
      }, { status: 400 });
    }
  } catch (err: any) {
    console.error('Aksora connection test failed:', err.message);
    const status = err.response?.status || 500;
    const detail = err.response?.data?.error || err.message || 'Failed to connect to Aksora API';
    return NextResponse.json({ valid: false, detail }, { status });
  }
}
