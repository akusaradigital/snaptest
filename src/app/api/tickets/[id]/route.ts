import { NextResponse } from 'next/server';
import { getDB, ensureSchema } from '../../db';
import { auth } from '@/auth';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    await ensureSchema();
    const sql = getDB();
    const rows = await sql`SELECT * FROM tickets WHERE id = ${params.id} AND user_id = ${userId}`;
    const record = rows[0] ?? null;

    if (!record) {
      return NextResponse.json({ detail: 'Ticket session not found' }, { status: 404 });
    }

    let messages: any[] = [];
    try { messages = JSON.parse(record.messages_json || '[]'); } catch { messages = []; }
    delete record.messages_json;
    record.messages = messages;

    return NextResponse.json(record);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    await ensureSchema();
    const sql = getDB();
    await sql`DELETE FROM tickets WHERE id = ${params.id} AND user_id = ${userId}`;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
