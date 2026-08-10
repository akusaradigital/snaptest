import { NextResponse } from 'next/server';
import { getDB } from '../../../db';
import { auth } from '@/auth';
import { crawlPage } from '../../../crawler';
import crypto from 'crypto';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const sql = getDB();
    const rows = await sql`SELECT * FROM monitored_urls WHERE id = ${params.id} AND user_id = ${userId}`;
    const record = rows[0] ?? null;

    if (!record) {
      return NextResponse.json({ detail: 'Monitor record not found' }, { status: 404 });
    }

    const pageData = await crawlPage(record.url);
    const currentSelectors = new Set(pageData.elements.map(el => el.css_selector));

    const storedSelectors = JSON.parse(record.selectors_json || '[]');
    const updatedSelectors: any[] = [];
    let brokenCount = 0;

    for (const sel of storedSelectors) {
      const isValid = currentSelectors.has(sel.css_selector);
      if (!isValid) {
        brokenCount++;
      }
      updatedSelectors.push({ ...sel, is_valid: isValid });
    }

    let status = 'healthy';
    if (brokenCount > 0) {
      if (brokenCount < storedSelectors.length * 0.3) {
        status = 'warning';
      } else {
        status = 'broken';
      }
    }

    const now = new Date().toISOString();
    const updatedSelectorsJSON = JSON.stringify(updatedSelectors);

    const snapshotID = crypto.randomUUID();
    const [updatedRows] = await sql.transaction(tx => [
      tx`
        UPDATE monitored_urls
        SET last_checked = ${now}, selectors_json = ${updatedSelectorsJSON},
            selectors_total = ${storedSelectors.length}, selectors_broken = ${brokenCount},
            status = ${status}, updated_at = ${now}
        WHERE id = ${params.id} AND user_id = ${userId}
        RETURNING id`,
      tx`
        INSERT INTO monitor_snapshots
         (id, monitor_id, selectors_json, selectors_total, selectors_broken, status, checked_at)
        SELECT ${snapshotID}, id, ${updatedSelectorsJSON}, ${storedSelectors.length}, ${brokenCount}, ${status}, ${now}
        FROM monitored_urls
        WHERE id = ${params.id} AND user_id = ${userId}`,
    ]);
    if (updatedRows.length === 0) {
      return NextResponse.json({ detail: 'Monitor record not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      status,
      selectors_total: storedSelectors.length,
      selectors_broken: brokenCount
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
