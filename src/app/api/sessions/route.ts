import { NextResponse } from 'next/server';
import { getDB, ensureSchema } from '../db';
import { auth } from '@/auth';
import { decodeSessionData, SESSION_LIMITS } from '@/lib/serverSessionContract';

function boundedString(value: unknown, field: string, max: number, required = true) {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const result = value.trim();
  if (required && !result) throw new Error(`${field} is required`);
  if (result.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return result;
}

function validationError(message: string) {
  return NextResponse.json({ detail: message }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ items: [] });

    const { searchParams } = new URL(request.url);
    let agentType: string;
    try {
      agentType = boundedString(searchParams.get('agent_type'), 'agent_type', SESSION_LIMITS.agentType);
    } catch (error) {
      return validationError(error instanceof Error ? error.message : 'Invalid agent_type');
    }

    await ensureSchema();
    const sql = getDB();
    const records = await sql`
      SELECT id, title, created_at, updated_at
      FROM agent_sessions
      WHERE user_id = ${userId} AND agent_type = ${agentType}
      ORDER BY updated_at DESC
      LIMIT 100
    `;

    return NextResponse.json({ items: records || [] });
  } catch (error) {
    console.error('[sessions:GET]', error);
    return NextResponse.json({ detail: 'Failed to load sessions' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return validationError('Request body must be valid JSON');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return validationError('Request body must be an object');

    const input = body as Record<string, unknown>;
    let id: string, agentType: string, title: string, dataStr: string;
    try {
      id = boundedString(input.id, 'id', SESSION_LIMITS.id);
      agentType = boundedString(input.agent_type, 'agent_type', SESSION_LIMITS.agentType);
      title = input.title == null ? 'New Session' : boundedString(input.title, 'title', SESSION_LIMITS.title, false) || 'New Session';
      // Legacy ticket/generate callers may still send JSON text rather than a parsed value.
      const rawData = typeof input.data_json === 'string' ? JSON.parse(input.data_json) : input.data_json;
      const envelope = decodeSessionData(rawData);
      dataStr = JSON.stringify(envelope);
      if (new TextEncoder().encode(dataStr).length > SESSION_LIMITS.dataBytes) {
        throw new Error(`data_json exceeds ${SESSION_LIMITS.dataBytes} bytes`);
      }
    } catch (error) {
      return validationError(error instanceof Error ? error.message : 'Invalid session payload');
    }

    await ensureSchema();
    const sql = getDB();
    const now = new Date().toISOString();
    const records = await sql`
      INSERT INTO agent_sessions (id, user_id, agent_type, title, data_json, created_at, updated_at)
      VALUES (${id}, ${userId}, ${agentType}, ${title}, ${dataStr}, ${now}, ${now})
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        data_json = EXCLUDED.data_json,
        updated_at = EXCLUDED.updated_at
      WHERE agent_sessions.user_id = EXCLUDED.user_id
        AND agent_sessions.agent_type = EXCLUDED.agent_type
      RETURNING id
    `;

    if (!records?.length) return NextResponse.json({ detail: 'Session id is already in use' }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[sessions:POST]', error);
    return NextResponse.json({ detail: 'Failed to save session' }, { status: 500 });
  }
}
