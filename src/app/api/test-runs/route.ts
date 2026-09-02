import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDB, ensureSchema } from "@/app/api/db";
import crypto from "crypto";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.user?.email;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const historyId = searchParams.get("historyId");
  if (!historyId) {
    return NextResponse.json({ error: "Missing historyId" }, { status: 400 });
  }

  await ensureSchema();
  const db = getDB();

  const runs = await db`
    SELECT * FROM test_runs
    WHERE history_id = ${historyId}
    ORDER BY ran_at DESC
  `;

  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.email;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { historyId, browser, os, status = "pass", notes = "" } = body;

  if (!historyId || !browser || !os) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  await ensureSchema();
  const db = getDB();
  const now = new Date().toISOString();

  // Check if cell already exists for this historyId, browser, and OS
  const existing = await db`
    SELECT id FROM test_runs
    WHERE history_id = ${historyId} AND browser = ${browser} AND os = ${os}
    LIMIT 1
  `;

  if (existing.length > 0) {
    await db`
      UPDATE test_runs
      SET status = ${status}, notes = ${notes}, tester_email = ${userId}, ran_at = ${now}
      WHERE id = ${existing[0].id}
    `;
    return NextResponse.json({ ok: true, id: existing[0].id, status });
  }

  const id = `run_${crypto.randomUUID()}`;
  await db`
    INSERT INTO test_runs (id, history_id, user_id, browser, os, status, notes, tester_email, ran_at)
    VALUES (${id}, ${historyId}, ${userId}, ${browser}, ${os}, ${status}, ${notes}, ${userId}, ${now})
  `;

  return NextResponse.json({ ok: true, id, status });
}
