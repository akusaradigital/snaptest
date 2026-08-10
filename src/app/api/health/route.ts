import { NextResponse } from 'next/server';
import { getDB } from '../db';

export const dynamic = 'force-dynamic';

// Touches the DB with a trivial query so Neon stays warm (avoids autosuspend
// cold-starts). Safe: failure never 500s, just reports db: false.
export async function GET() {
  let db = false;
  try {
    await getDB()`SELECT 1`;
    db = true;
  } catch (err) {
    console.warn('Health DB ping failed:', err);
  }
  return NextResponse.json({ status: 'healthy', db });
}
