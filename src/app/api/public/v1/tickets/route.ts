import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { resolveApiKey } from '@/lib/apiKeys';
import { ensureSchema, getDB } from '@/app/api/db';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const rawKey = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

    if (!rawKey) {
      return NextResponse.json(
        { error: 'Missing or malformed Authorization header. Expected: Bearer snaptest_...' },
        { status: 401 }
      );
    }

    const resolved = await resolveApiKey(rawKey);
    if (!resolved?.userId) {
      return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 });
    }

    if (!checkRateLimit(resolved.userId)) {
      return NextResponse.json({ error: 'Rate limit exceeded (30 req/min)' }, { status: 429 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { title, description, evidenceUrl } = body || {};
    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Field "title" is required' }, { status: 400 });
    }

    await ensureSchema();
    const db = getDB();
    const id = randomUUID();
    const now = new Date().toISOString();

    const ticketResult = {
      has_ticket_data: true,
      title: title.trim(),
      issue_type: 'Bug',
      description: description ? String(description).trim() : '',
      evidence: evidenceUrl ? String(evidenceUrl).trim() : '',
      steps_to_reproduce: [],
      expected_behavior: '',
      current_behavior: '',
    };

    const messages = [
      {
        id: randomUUID(),
        role: 'assistant',
        content: `Bug ticket imported from BugSnap: **${title.trim()}**`,
        ticket_result: ticketResult,
        timestamp: now,
      },
    ];

    const sessionTitle = title.trim().substring(0, 100);
    const messagesJson = JSON.stringify(messages);

    await db`
      INSERT INTO tickets (id, user_id, title, messages_json, created_at, updated_at)
      VALUES (${id}, ${resolved.userId}, ${sessionTitle}, ${messagesJson}, ${now}, ${now})
    `;

    return NextResponse.json(
      {
        success: true,
        data: {
          id,
          title: sessionTitle,
          ticket: ticketResult,
          createdAt: now,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
