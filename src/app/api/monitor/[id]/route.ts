import { NextResponse } from 'next/server';
import { getDB } from '../../db';
import { auth } from '@/auth';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const sql = getDB();
    const result = await sql`DELETE FROM monitored_urls WHERE id = ${params.id} AND user_id = ${userId} RETURNING id`;

    if (!result || result.length === 0) {
      return NextResponse.json({ detail: 'Monitor record not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Monitor deleted' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
