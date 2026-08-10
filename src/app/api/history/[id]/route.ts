import { NextResponse } from 'next/server';
import { getDB } from '../../db';
import { auth } from '@/auth';

// ponytail: same team scope as list endpoint — expand must see teammates' records
async function getTeamUserIds(sql: any, userId: string): Promise<string[]> {
  try {
    const teams = await sql`SELECT team_id FROM team_members WHERE user_id = ${userId}`;
    if (!teams.length) return [userId];
    const teamIds = teams.map((t: any) => t.team_id);
    const members = await sql`SELECT DISTINCT user_id FROM team_members WHERE team_id = ANY(${teamIds})`;
    return members.map((m: any) => m.user_id);
  } catch {
    return [userId];
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const sql = getDB();
    const userIds = await getTeamUserIds(sql, userId);
    const rows = await sql`SELECT * FROM history WHERE id = ${params.id} AND user_id = ANY(${userIds})`;
    const record = rows[0] ?? null;

    if (!record) {
      return NextResponse.json({ detail: 'History record not found' }, { status: 404 });
    }

    let scripts: any[] = [];
    let test_cases: any[] = [];
    try { scripts = JSON.parse(record.scripts_json || '[]'); } catch { scripts = []; }
    try { test_cases = JSON.parse(record.test_cases_json || '[]'); } catch { test_cases = []; }
    delete record.scripts_json;
    delete record.test_cases_json;
    record.scripts = scripts;
    record.test_cases = test_cases.length ? test_cases : undefined;

    return NextResponse.json(record);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const { is_public } = await request.json();
    const sql = getDB();
    await sql`UPDATE history SET is_public = ${!!is_public} WHERE id = ${params.id} AND user_id = ${userId}`;
    return NextResponse.json({ success: true, is_public: !!is_public });
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

    const sql = getDB();
    const rows = await sql`SELECT scripts_json FROM history WHERE id = ${params.id} AND user_id = ${userId}`;
    const record = rows[0] ?? null;
    if (!record) return NextResponse.json({ detail: 'History record not found' }, { status: 404 });

    await sql`DELETE FROM history WHERE id = ${params.id} AND user_id = ${userId}`;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
