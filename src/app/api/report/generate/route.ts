import { NextResponse } from 'next/server';
import { callLLM } from '@/app/api/ai/llm';
import { getDB, ensureSchema, logUsage } from '../../db';
import { auth } from '@/auth';

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { ai_provider, ai_model, api_key } = body;

    if (!ai_provider || !ai_model || !api_key) {
      return NextResponse.json(
        { error: 'Missing required fields: ai_provider, ai_model, api_key' },
        { status: 400 }
      );
    }

    await ensureSchema();
    const sql = getDB();

    // Fetch last 30 days of data from history, tickets, and usage_log
    const [historyRows, ticketRows, usageRows] = await Promise.all([
      sql`
        SELECT count(*)::INT AS count FROM history
        WHERE user_id = ${userId} AND
          created_at::timestamp >= NOW() - INTERVAL '30 days'
      `,
      sql`
        SELECT count(*)::INT AS count FROM tickets
        WHERE user_id = ${userId} AND
          created_at::timestamp >= NOW() - INTERVAL '30 days'
      `,
      sql`
        SELECT
          COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
          COUNT(*)::INT AS total_requests
        FROM usage_log
        WHERE user_id = ${userId} AND
          created_at::timestamp >= NOW() - INTERVAL '30 days'
      `,
    ]);

    const historyCount = Number(historyRows[0]?.count || 0);
    const ticketCount = Number(ticketRows[0]?.count || 0);
    const totalTokens = Number(usageRows[0]?.total_tokens || 0);
    const totalRequests = Number(usageRows[0]?.total_requests || 0);

    // Build a natural-language summary for the LLM
    const dataSummary = [
      `In the last 30 days:`,
      `- Generated ${historyCount} test case(s)`,
      `- Resolved ${ticketCount} Jira/ticket item(s)`,
      `- Used ${totalTokens.toLocaleString()} total AI tokens across ${totalRequests} AI request(s)`,
    ].join('\n');

    const systemPrompt =
      'You are an expert QA Manager. Analyze the provided testing activity data and generate a professional Executive Test Summary Report. Return JSON: { "title": "...", "summary": "...", "key_achievements": ["..."], "risk_assessment": "...", "recommendations": ["..."] }.';

    const raw = await callLLM(
      ai_provider,
      ai_model,
      api_key,
      systemPrompt,
      dataSummary,
      true,
      4096
    );

    const parsed = JSON.parse(raw);

    if (userId) {
      await logUsage({
        user_id: userId,
        source: 'test_generation', // ponytail: add report-specific source to logUsage union when it grows
        provider: ai_provider,
        model: ai_model,
        total_tokens: Math.ceil(dataSummary.length + raw.length / 4),
      });
    }

    return NextResponse.json({ result: parsed });
  } catch (error: any) {
    console.error('Report API Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate executive report' },
      { status: 500 }
    );
  }
}
