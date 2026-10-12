import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validatedAxiosRequest } from '@/lib/outbound-url';
import { extractSpreadsheetId, getSpreadsheetSheets } from '@/lib/google-sheets';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { webhook_url, sheet_url, access_token } = await request.json();
    const token = access_token || (session as any)?.accessToken;
    const spreadsheetId = extractSpreadsheetId(sheet_url);

    // 1. If Google Spreadsheet link is provided
    if (spreadsheetId) {
      if (!token) {
        return NextResponse.json({
          valid: false,
          need_auth: true,
          detail: 'Google Account not connected. Click "Connect with Google" to authorize access to this spreadsheet.',
        });
      }

      try {
        const sheets = await getSpreadsheetSheets(token, spreadsheetId);
        const tabNames = sheets.map((s) => s.title).join(', ');
        return NextResponse.json({
          valid: true,
          message: `Connected to Google Spreadsheet! Found tabs: ${tabNames || 'Sheet1'}`,
        });
      } catch (err: any) {
        return NextResponse.json({
          valid: false,
          detail: `Cannot access Google Spreadsheet: ${err.message}`,
        });
      }
    }

    // 2. If Webhook URL is provided
    if (webhook_url && /^https?:\/\//i.test(webhook_url)) {
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
        message: 'Connected to Google Spreadsheet webhook successfully!',
      });
    }

    return NextResponse.json({
      valid: false,
      detail: 'Please provide either a valid Google Spreadsheet Link or Webhook URL.',
    }, { status: 400 });
  } catch (err: any) {
    console.error('Spreadsheet test failed:', err);
    return NextResponse.json({
      valid: false,
      detail: err.message || 'Failed to connect to Google Sheets',
    }, { status: 400 });
  }
}
