import { NextResponse } from 'next/server';
import { getDB, ensureSchema } from '../db';
import { auth } from '@/auth';

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

export async function GET(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ items: [], count: 0 });

    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const sql = getDB();
    // include history from all team members
    const userIds = await getTeamUserIds(sql, userId);
    let records;

    if (search) {
      const searchParam = '%' + search + '%';
      records = await sql`
        SELECT id, url, user_context, page_title, elements_found,
               ai_provider, ai_model, scripts_count, user_id,
               CASE
                 WHEN jsonb_array_length(COALESCE(test_cases_json,'[]')::jsonb) > 0
                 THEN jsonb_array_length(test_cases_json::jsonb)
                 ELSE GREATEST(0, array_length(string_to_array(test_case_table, E'\\n'), 1) - 2)
               END AS test_cases_count,
               created_at
        FROM history
        WHERE user_id = ANY(${userIds})
          AND (url ILIKE ${searchParam} OR user_context ILIKE ${searchParam} OR page_title ILIKE ${searchParam})
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    } else {
      records = await sql`
        SELECT id, url, user_context, page_title, elements_found,
               ai_provider, ai_model, scripts_count, user_id,
               CASE
                 WHEN jsonb_array_length(COALESCE(test_cases_json,'[]')::jsonb) > 0
                 THEN jsonb_array_length(test_cases_json::jsonb)
                 ELSE GREATEST(0, array_length(string_to_array(test_case_table, E'\\n'), 1) - 2)
               END AS test_cases_count,
               created_at
        FROM history
        WHERE user_id = ANY(${userIds})
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    }

    return NextResponse.json({
      items: records || [],
      count: records?.length || 0
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    await ensureSchema();
    const sql = getDB();
    await sql`DELETE FROM history WHERE user_id = ${userId}`;
    return NextResponse.json({
      success: true,
      message: 'Deleted all records'
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
