import { NextResponse } from 'next/server';
import { getDB, ensureSchema } from '../db';
import { auth } from '@/auth';

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ items: [], count: 0 });

    await ensureSchema();
    const sql = getDB();
    const records = await sql`
      SELECT id, title, created_at, updated_at,
             jsonb_array_length(COALESCE(messages_json,'[]')::jsonb) AS message_count
      FROM tickets
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC
      LIMIT 100
    `;

    return NextResponse.json({
      items: records || [],
      count: records?.length || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const { id, title, messages } = await request.json();
    if (!id || !Array.isArray(messages)) {
      return NextResponse.json({ detail: 'Session ID and messages array are required' }, { status: 400 });
    }

    // Strip image_base64 to avoid huge payloads in DB
    const cleanMessages = messages.map((m: any) => {
      const copy = { ...m };
      delete copy.image_base64;
      return copy;
    });

    await ensureSchema();
    const sql = getDB();
    const now = new Date().toISOString();
    const messagesJson = JSON.stringify(cleanMessages);
    const sessionTitle = (title || 'New Ticket Chat').substring(0, 100);

    await sql`
      INSERT INTO tickets (id, user_id, title, messages_json, created_at, updated_at)
      VALUES (${id}, ${userId}, ${sessionTitle}, ${messagesJson}, ${now}, ${now})
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        messages_json = EXCLUDED.messages_json,
        updated_at = EXCLUDED.updated_at
    `;

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    await ensureSchema();
    const sql = getDB();
    await sql`DELETE FROM tickets WHERE user_id = ${userId}`;
    return NextResponse.json({ success: true, message: 'Deleted all ticket sessions' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
