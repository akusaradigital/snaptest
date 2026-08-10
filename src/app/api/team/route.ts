import { NextResponse } from 'next/server';
import { getDB, ensureSchema } from '../db';
import { auth } from '@/auth';
import crypto from 'crypto';

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    await ensureSchema();
    const sql = getDB();
    const teams = await sql`
      SELECT t.*, tm.role
      FROM teams t
      JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = ${userId}
      ORDER BY t.created_at DESC
    `;
    return NextResponse.json({ teams });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    await ensureSchema();
    const { name } = await request.json();
    if (!name?.trim()) return NextResponse.json({ detail: 'Team name required' }, { status: 400 });

    const sql = getDB();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await sql`INSERT INTO teams (id, name, owner_id, created_at) VALUES (${id}, ${name.trim()}, ${userId}, ${now})`;
    await sql`INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (${id}, ${userId}, 'owner', ${now})`;

    return NextResponse.json({ id, name: name.trim(), owner_id: userId, role: 'owner', created_at: now });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
