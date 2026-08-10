import { NextResponse } from 'next/server';
import { getDB } from '../../../db';
import { auth } from '@/auth';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const sql = getDB();
    // verify requester is in the team
    const membership = await sql`SELECT 1 FROM team_members WHERE team_id = ${params.id} AND user_id = ${userId}`;
    if (!membership.length) return NextResponse.json({ detail: 'Not found' }, { status: 404 });

    const members = await sql`SELECT user_id, role, created_at FROM team_members WHERE team_id = ${params.id} ORDER BY created_at ASC`;
    return NextResponse.json({ members });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

// DELETE /api/team/[id]/members?user=email - leave or remove member
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetUser = searchParams.get('user') || userId;

    const sql = getDB();
    // only owner can remove others; anyone can remove themselves
    if (targetUser !== userId) {
      const ownership = await sql`SELECT 1 FROM team_members WHERE team_id = ${params.id} AND user_id = ${userId} AND role = 'owner'`;
      if (!ownership.length) return NextResponse.json({ detail: 'Forbidden' }, { status: 403 });
    }

    await sql`DELETE FROM team_members WHERE team_id = ${params.id} AND user_id = ${targetUser}`;

    // if team has no members left, delete the team
    const remaining = await sql`SELECT COUNT(*) as c FROM team_members WHERE team_id = ${params.id}`;
    if (Number(remaining[0]?.c) === 0) {
      await sql`DELETE FROM teams WHERE id = ${params.id}`;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
