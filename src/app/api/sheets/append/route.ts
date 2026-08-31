import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validatedAxiosRequest } from '@/lib/outbound-url';

export async function POST(request: Request) {
  try {
    if (!(await auth())?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    const {
      webhook_url,
      sheet_url,
      sheet_name = 'QA Tickets',
      ticket,
    } = await request.json();

    if (!webhook_url || !/^https?:\/\//i.test(webhook_url)) {
      return NextResponse.json({ detail: 'Valid Spreadsheet Webhook URL is required' }, { status: 400 });
    }
    if (!ticket) {
      return NextResponse.json({ detail: 'Ticket data is required' }, { status: 400 });
    }

    const payloadData = {
      action: 'append',
      sheet_name,
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
        : (ticket.acceptance_criteria || ''),
      evidence: ticket.evidence || '',
      jira_key: ticket.jira_key || '',
      jira_url: ticket.jira_url || '',
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
    });
  } catch (err: any) {
    console.error('Spreadsheet append failed:', err);
    return NextResponse.json({ detail: err.message || 'Failed to sync ticket to Spreadsheet' }, { status: 500 });
  }
}
