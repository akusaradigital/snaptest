import { NextResponse } from 'next/server';
import { getDB } from '../../../db';
import { auth } from '@/auth';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const { email } = await request.json();
    if (!email?.trim()) return NextResponse.json({ detail: 'Email required' }, { status: 400 });

    const sql = getDB();
    // only owner can invite
    const membership = await sql`SELECT role FROM team_members WHERE team_id = ${params.id} AND user_id = ${userId}`;
    if (!membership.length) return NextResponse.json({ detail: 'Not found' }, { status: 404 });
    if (membership[0].role !== 'owner') {
      return NextResponse.json({ detail: 'Only team owner can invite members' }, { status: 403 });
    }

    const now = new Date().toISOString();
    // upsert - if already a member, no-op
    await sql`
      INSERT INTO team_members (team_id, user_id, role, created_at)
      VALUES (${params.id}, ${email.trim().toLowerCase()}, 'member', ${now})
      ON CONFLICT (team_id, user_id) DO NOTHING
    `;

    return NextResponse.json({ success: true, email: email.trim().toLowerCase() });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
