import { NextResponse } from 'next/server';
import { getDB } from '../../db';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const sql = getDB();
    const rows = await sql`SELECT * FROM history WHERE id = ${params.id} AND is_public = true`;
    const record = rows[0] ?? null;
    if (!record) return NextResponse.json({ detail: 'Not found' }, { status: 404 });

    let scripts: any[] = [];
    let test_cases: any[] = [];
    try { scripts = JSON.parse(record.scripts_json || '[]'); } catch { scripts = []; }
    try { test_cases = JSON.parse(record.test_cases_json || '[]'); } catch { test_cases = []; }
    delete record.scripts_json;
    delete record.test_cases_json;
    // strip private fields
    delete record.user_id;
    record.scripts = scripts;
    record.test_cases = test_cases.length ? test_cases : undefined;

    return NextResponse.json(record);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
