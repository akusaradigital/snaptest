import { NextResponse } from 'next/server';
import { getDB, ensureSchema } from '../db';
import { auth } from '@/auth';

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    await ensureSchema();
    const sql = getDB();

    const rows = await sql`
      SELECT
        COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
        COALESCE(SUM(cache_read_tokens), 0)::BIGINT AS total_cache_read_tokens,
        COALESCE(SUM(cache_creation_tokens), 0)::BIGINT AS total_cache_creation_tokens,
        COUNT(*)::INT AS total_requests
      FROM usage_log
      WHERE user_id = ${userId}
        AND created_at::timestamp >= NOW() - INTERVAL '30 days'
    `;

    const summary = rows[0] || {
      total_tokens: 0,
      total_cache_read_tokens: 0,
      total_cache_creation_tokens: 0,
      total_requests: 0,
    };

    return NextResponse.json({
      summary: {
        total_tokens: Number(summary.total_tokens),
        total_cache_read_tokens: Number(summary.total_cache_read_tokens),
        total_cache_creation_tokens: Number(summary.total_cache_creation_tokens),
        total_requests: Number(summary.total_requests),
      }
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
