import { NextResponse } from "next/server";
import { resolveApiKey } from "@/lib/apiKeys";
import { ensureSchema, getDB } from "@/app/api/db";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    await ensureSchema();
    const db = getDB();

    const rows = await db`
      SELECT id, url, page_title, test_cases_json, scripts_json
      FROM history
      WHERE id = ${params.id} AND user_id = ${resolved.userId}
      LIMIT 1
    `;

    if (!rows.length) {
      return NextResponse.json({ error: "Suite not found" }, { status: 404 });
    }

    const suite = rows[0];
    const scripts = JSON.parse(suite.scripts_json || "[]");
    const testCases = JSON.parse(suite.test_cases_json || "[]");

    return NextResponse.json({
      id: suite.id,
      url: suite.url,
      title: suite.page_title,
      scripts,
      testCases,
    });
  } catch (err) {
    console.error("Error fetching suite for runner:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
