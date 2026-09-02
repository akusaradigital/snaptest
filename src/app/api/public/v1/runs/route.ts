import { NextResponse } from "next/server";
import { resolveApiKey } from "@/lib/apiKeys";
import { ensureSchema, getDB } from "@/app/api/db";
import { checkRateLimit } from "@/lib/rateLimit";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const rawKey = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

    if (!rawKey) {
      return NextResponse.json(
        { error: "Missing or malformed Authorization header. Expected: Bearer snaptest_..." },
        { status: 401 }
      );
    }

    const resolved = await resolveApiKey(rawKey);
    if (!resolved?.userId) {
      return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
    }

    if (!checkRateLimit(resolved.userId)) {
      return NextResponse.json({ error: "Rate limit exceeded (30 req/min)" }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const { suiteId, browser = "headless", os = "ci", results = [], notes = "" } = body;

    if (!suiteId) {
      return NextResponse.json({ error: "Field suiteId is required" }, { status: 400 });
    }

    await ensureSchema();
    const db = getDB();
    const now = new Date().toISOString();
    const passed = results.filter((r: any) => r.status === "passed" || r.status === "pass").length;
    const failed = results.filter((r: any) => r.status === "failed" || r.status === "fail").length;
    const overallStatus = failed > 0 ? "fail" : "pass";

    const id = `run_${crypto.randomUUID()}`;
    const resultSummary = `CI Run: ${passed} passed, ${failed} failed. ${notes}`.trim();

    await db`
      INSERT INTO test_runs (id, history_id, user_id, browser, os, status, notes, tester_email, ran_at)
      VALUES (${id}, ${suiteId}, ${resolved.userId}, ${browser}, ${os}, ${overallStatus}, ${resultSummary}, ${"CI Runner"}, ${now})
    `;

    return NextResponse.json(
      {
        success: true,
        runId: id,
        status: overallStatus,
        summary: { passed, failed, total: results.length },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Error reporting test runs:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
