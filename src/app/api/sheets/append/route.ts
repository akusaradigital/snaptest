import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validatedAxiosRequest } from '@/lib/outbound-url';
import {
  extractSpreadsheetId,
  appendRowsViaGoogleApi,
  refreshGoogleToken,
  buildSpreadsheetUrl,
} from '@/lib/google-sheets';

const QA_TICKET_HEADERS = [
  'Date',
  'Issue Type',
  'Priority',
  'Title',
  'Assignee',
  'Component',
  'Description',
  'Expected Result',
  'Actual Result',
  'Acceptance Criteria',
  'Evidence',
  'Jira Key',
  'Timestamp',
];

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      webhook_url,
      sheet_url,
      sheet_name,
      ticket,
      headers: customHeaders,
      rows: customRows,
      access_token: providedAccessToken,
      refresh_token: providedRefreshToken,
    } = body;

    // Resolve target sheet tab name
    const targetSheetName = sheet_name || (ticket ? 'QA Tickets' : 'Sheet1');

    // Resolve rows and headers
    let finalHeaders: string[] = customHeaders || [];
    let finalRows: (string | number | boolean | null)[][] = customRows || [];

    // If a ticket payload is provided (from Ticket Page / TicketChatBubble)
    if (ticket && (!customRows || customRows.length === 0)) {
      finalHeaders = QA_TICKET_HEADERS;
      finalRows = [
        [
          new Date().toLocaleDateString(),
          ticket.issue_type || 'Bug',
          ticket.priority || 'P1',
          (ticket.title || '').replace(/\*\*/g, '').trim(),
          ticket.assignee_name || 'Unassigned',
          ticket.component || '',
          (ticket.description || '').replace(/\*\*/g, '').trim(),
          (ticket.expected_result || '').replace(/\*\*/g, '').trim(),
          (ticket.actual_result || ticket.current_behavior || '').replace(/\*\*/g, '').trim(),
          Array.isArray(ticket.acceptance_criteria)
            ? ticket.acceptance_criteria.join('; ')
            : ticket.acceptance_criteria || '',
          ticket.evidence || '',
          ticket.jira_key || '',
          new Date().toISOString(),
        ],
      ];
    }

    if (!finalRows || finalRows.length === 0) {
      return NextResponse.json({ detail: 'No data rows provided to append' }, { status: 400 });
    }

    const spreadsheetId = extractSpreadsheetId(sheet_url);
    const sessionToken = (session as any)?.accessToken;
    let activeAccessToken = providedAccessToken || sessionToken;

    // PATH 1: Direct Google Sheets API via Spreadsheet Link
    if (spreadsheetId) {
      if (!activeAccessToken && !webhook_url) {
        return NextResponse.json(
          {
            need_auth: true,
            detail: 'Google Account authorization required to write to this spreadsheet link. Please connect your Google account in Settings or use a Webhook.',
          },
          { status: 401 }
        );
      }

      if (activeAccessToken) {
        try {
          const apiResult = await appendRowsViaGoogleApi({
            accessToken: activeAccessToken,
            spreadsheetId,
            sheetName: targetSheetName,
            headers: finalHeaders,
            rows: finalRows,
          });

          return NextResponse.json({
            success: true,
            sheet_url: apiResult.sheetUrl,
            updated_rows: apiResult.updatedRows,
          });
        } catch (apiErr: any) {
          // If token expired, attempt refresh if refresh_token is provided
          const isAuthError = /401|invalid_grant|unauthorized/i.test(apiErr?.message || '');
          if (isAuthError && providedRefreshToken) {
            try {
              const refreshed = await refreshGoogleToken(providedRefreshToken);
              activeAccessToken = refreshed.access_token;
              const retryResult = await appendRowsViaGoogleApi({
                accessToken: activeAccessToken,
                spreadsheetId,
                sheetName: targetSheetName,
                headers: finalHeaders,
                rows: finalRows,
              });
              return NextResponse.json({
                success: true,
                sheet_url: retryResult.sheetUrl,
                updated_rows: retryResult.updatedRows,
                new_access_token: activeAccessToken,
              });
            } catch {}
          }

          // If direct API failed and no webhook fallback exists, throw error
          if (!webhook_url) {
            throw apiErr;
          }
        }
      }
    }

    // PATH 2: Webhook URL fallback (Google Apps Script / Zapier / Make)
    if (webhook_url && /^https?:\/\//i.test(webhook_url)) {
      const payloadData = ticket
        ? {
            action: 'append',
            sheet_name: targetSheetName,
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString(),
            issue_type: ticket.issue_type || 'Bug',
            priority: ticket.priority || 'P1',
            title: (ticket.title || '').replace(/\*\*/g, '').trim(),
            component: ticket.component || '',
            assignee: ticket.assignee_name || 'Unassigned',
            description: (ticket.description || '').replace(/\*\*/g, '').trim(),
            current_behavior: (ticket.current_behavior || '').replace(/\*\*/g, '').trim(),
            expected_result: (ticket.expected_result || '').replace(/\*\*/g, '').trim(),
            actual_result: (ticket.actual_result || '').replace(/\*\*/g, '').trim(),
            acceptance_criteria: Array.isArray(ticket.acceptance_criteria)
              ? ticket.acceptance_criteria.join('; ')
              : ticket.acceptance_criteria || '',
            evidence: ticket.evidence || '',
            jira_key: ticket.jira_key || '',
            jira_url: ticket.jira_url || '',
          }
        : {
            action: 'append_batch',
            sheet_name: targetSheetName,
            timestamp: new Date().toISOString(),
            headers: finalHeaders,
            rows: finalRows,
          };

      const res = await validatedAxiosRequest(webhook_url.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: payloadData,
        timeout: 15000,
      });

      if (res.status >= 400) throw new Error('Spreadsheet webhook failed');

      const resultUrl = res.data?.sheet_url || sheet_url || webhook_url;
      return NextResponse.json({
        success: true,
        sheet_url: resultUrl,
        row_index: res.data?.row || null,
        updated_rows: finalRows.length,
      });
    }

    return NextResponse.json(
      { detail: 'Either a valid Google Spreadsheet Link or Webhook URL is required.' },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('Spreadsheet append failed:', err);
    return NextResponse.json(
      { detail: err.message || 'Failed to sync data to Spreadsheet' },
      { status: 500 }
    );
  }
}
