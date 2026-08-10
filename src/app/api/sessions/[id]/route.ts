import { NextResponse } from 'next/server';
import { getDB, ensureSchema } from '../../db';
import { auth } from '@/auth';
import { decodeSessionData, SESSION_LIMITS } from '@/lib/serverSessionContract';

function validId(id: string) {
  return id.length > 0 && id.length <= SESSION_LIMITS.id;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!validId(params.id)) return NextResponse.json({ detail: 'Invalid session id' }, { status: 400 });

    await ensureSchema();
    const sql = getDB();
    const records = await sql`
      SELECT id, title, data_json, updated_at
      FROM agent_sessions
      WHERE id = ${params.id} AND user_id = ${userId}
    `;

    if (!records?.length) return NextResponse.json({ detail: 'Session not found' }, { status: 404 });

    let decoded;
    try {
      decoded = decodeSessionData(JSON.parse(records[0].data_json));
    } catch (error) {
      console.error(`[sessions:detail] malformed data for ${params.id}`, error);
      return NextResponse.json({ detail: 'Stored session data is malformed' }, { status: 422 });
    }

    return NextResponse.json({
      id: records[0].id,
      title: records[0].title,
      updated_at: records[0].updated_at,
      version: decoded.version,
      data: decoded.data,
    });
  } catch (error) {
    console.error('[sessions:detail:GET]', error);
    return NextResponse.json({ detail: 'Failed to load session' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!validId(params.id)) return NextResponse.json({ detail: 'Invalid session id' }, { status: 400 });

    await ensureSchema();
    const sql = getDB();
    await sql`DELETE FROM agent_sessions WHERE id = ${params.id} AND user_id = ${userId}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[sessions:detail:DELETE]', error);
    return NextResponse.json({ detail: 'Failed to delete session' }, { status: 500 });
  }
}
