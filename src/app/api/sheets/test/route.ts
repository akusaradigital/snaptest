import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validatedAxiosRequest } from '@/lib/outbound-url';

export async function POST(request: Request) {
  try {
    if (!(await auth())?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    const { webhook_url } = await request.json();

    if (!webhook_url || !/^https?:\/\//i.test(webhook_url)) {
      return NextResponse.json({ valid: false, detail: 'Valid Webhook URL is required (e.g. Google Apps Script Web App URL)' }, { status: 400 });
    }

    // Ping the webhook with a test payload
    const res = await validatedAxiosRequest(webhook_url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {
        action: 'test',
        source: 'SnapTest',
        timestamp: new Date().toISOString(),
      },
      timeout: 10000,
    });

    if (res.status >= 400) throw new Error('Spreadsheet webhook returned an error');

    return NextResponse.json({
      valid: true,
      message: 'Connected to Google Spreadsheet successfully!',
    });
  } catch (err: any) {
    console.error('Spreadsheet test failed:', err);
    return NextResponse.json({ valid: false, detail: err.message || 'Failed to connect to Spreadsheet webhook' }, { status: 400 });
  }
}
