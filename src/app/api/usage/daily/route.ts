import { NextResponse } from 'next/server';
import { getDB, ensureSchema } from '../../db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId || !process.env.DATABASE_URL?.trim()) return NextResponse.json({ daily: [] });

    await ensureSchema();
    const sql = getDB();

    const rows = await sql`
      SELECT
        DATE(created_at::timestamp) AS day,
        COALESCE(SUM(total_tokens), 0)::BIGINT AS tokens,
        COUNT(*)::INT AS requests
      FROM usage_log
      WHERE user_id = ${userId}
        AND created_at::timestamp >= NOW() - INTERVAL '365 days'
      GROUP BY day
      ORDER BY day ASC
    `;

    return NextResponse.json({ daily: rows.map(r => ({ day: r.day, tokens: Number(r.tokens), requests: Number(r.requests) })) });
  } catch {
    return NextResponse.json({ daily: [] });
  }
}
