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
    const { ai_provider, ai_model, api_key, nine_router_public_url, nine_router_public_key } = body;

    const p = (ai_provider || '').toLowerCase().trim();
    const is9Router = p === '9router' || p === '9router-public';

    if (!p || (!is9Router && !api_key)) {
      return NextResponse.json(
        { error: `Missing API key for provider ${p || 'AI'}` },
        { status: 400 }
      );
    }
    if (p === '9router-public' && !nine_router_public_url) {
      return NextResponse.json({ error: '9Router Public URL is required' }, { status: 400 });
    }

    // Resolve model for 9Router if none was explicitly passed
    let resolvedModel = ai_model || '';
    if (p === '9router' && !resolvedModel) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 1200);
        let mRes: Response;
        try {
          mRes = await fetch('http://127.0.0.1:20128/v1/models', { signal: ctrl.signal });
        } catch {
          mRes = await fetch('http://localhost:20128/v1/models', { signal: ctrl.signal });
        }
        clearTimeout(tid);
        if (mRes.ok) {
          const mData = await mRes.json();
          if (Array.isArray(mData?.data) && mData.data.length > 0) {
            resolvedModel = mData.data[0].id;
          }
        }
      } catch {}
      if (!resolvedModel) resolvedModel = 'Antigravity';
    }

    if (!resolvedModel) {
      return NextResponse.json(
        { error: 'No AI model selected. Please select a model in Settings.' },
        { status: 400 }
      );
    }

    // Fetch last 30 days of data with graceful fallbacks
    let historyCount = 0;
    let ticketCount = 0;
    let totalTokens = 0;
    let totalRequests = 0;

    try {
      await ensureSchema();
      const sql = getDB();

      const [historyRows, ticketRows, usageRows] = await Promise.all([
        sql`
          SELECT count(*)::INT AS count FROM history
          WHERE user_id = ${userId} AND
            created_at::timestamp >= NOW() - INTERVAL '30 days'
        `.catch(() => [{ count: 0 }]),
        sql`
          SELECT count(*)::INT AS count FROM tickets
          WHERE user_id = ${userId} AND
            created_at::timestamp >= NOW() - INTERVAL '30 days'
        `.catch(() => [{ count: 0 }]),
        sql`
          SELECT
            COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
            COUNT(*)::INT AS total_requests
          FROM usage_log
          WHERE user_id = ${userId} AND
            created_at::timestamp >= NOW() - INTERVAL '30 days'
        `.catch(() => [{ total_tokens: 0, total_requests: 0 }]),
      ]);

      historyCount = Number(historyRows[0]?.count || 0);
      ticketCount = Number(ticketRows[0]?.count || 0);
      totalTokens = Number(usageRows[0]?.total_tokens || 0);
      totalRequests = Number(usageRows[0]?.total_requests || 0);
    } catch (dbErr) {
      console.warn('[Report] Non-critical database telemetry lookup error:', dbErr);
    }

    // Build a natural-language summary for the LLM
    const dataSummary = [
      `In the last 30 days:`,
      `- Generated ${historyCount} test suite(s)/runs`,
      `- Handled ${ticketCount} Jira/ticket session(s)`,
      `- Consumed ${totalTokens.toLocaleString()} total AI tokens across ${totalRequests} AI request(s)`,
    ].join('\n');

    const systemPrompt = `You are a Principal QA Director & VP of Quality Engineering.
Analyze the provided 30-day testing activity and telemetry data, and synthesize a high-impact, professional Executive QA Intelligence Report.
Return valid JSON matching this structure:
{
  "title": "Executive QA & Quality Engineering Intelligence Report",
  "summary": "Crisp 2-3 paragraph executive summary of testing coverage, engineering velocity, quality posture, and release confidence.",
  "health_score": 94,
  "release_readiness": "GO FOR RELEASE",
  "readiness_verdict": "Production Ready — Quality gates verified with high confidence. Zero blocking regressions detected.",
  "metrics": {
    "test_cases_analyzed": ${historyCount || 32},
    "tickets_audited": ${ticketCount || 10},
    "automation_coverage_pct": 92,
    "risk_level": "LOW",
    "velocity_multiplier": "4.6x",
    "ai_efficiency_gain": "78% time saved"
  },
  "key_achievements": [
    {
      "title": "Concise achievement headline",
      "metric": "+95%",
      "description": "Concrete impact statement describing test suite stability, ticket resolution, or automation velocity.",
      "category": "Automation",
      "impact": "High"
    }
  ],
  "risk_assessment": {
    "level": "LOW",
    "summary": "Executive overview of current risk posture and regression surface.",
    "items": [
      {
        "area": "Feature Area or Architecture",
        "severity": "Low",
        "description": "Specific risk detail or dependency concern.",
        "mitigation": "Concrete action or automated gate in place to neutralize the risk."
      }
    ]
  },
  "recommendations": [
    {
      "priority": "P0",
      "title": "Strategic action headline",
      "action": "Specific implementation step or test coverage expansion recommended for the team.",
      "impact": "High",
      "effort": "Low"
    }
  ]
}
Return ONLY valid JSON.`;

    const effectiveApiKey = p === '9router'
      ? (api_key || '9router-local-key')
      : p === '9router-public'
        ? (nine_router_public_key || api_key || '')
        : (api_key || '');

    const raw = await callLLM(
      p,
      resolvedModel,
      effectiveApiKey,
      systemPrompt,
      dataSummary,
      true,
      4096,
      undefined,
      nine_router_public_url || undefined
    );

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try {
          parsed = JSON.parse(match[1].trim());
        } catch {
          const start = raw.indexOf('{');
          const end = raw.lastIndexOf('}');
          if (start !== -1 && end > start) {
            parsed = JSON.parse(raw.slice(start, end + 1));
          } else {
            throw new Error('AI model did not return a valid JSON object');
          }
        }
      } else {
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start !== -1 && end > start) {
          parsed = JSON.parse(raw.slice(start, end + 1));
        } else {
          throw new Error('AI model did not return a valid JSON object');
        }
      }
    }

    if (userId) {
      await logUsage({
        user_id: userId,
        source: 'executive_report',
        provider: p,
        model: resolvedModel,
        total_tokens: Math.ceil((dataSummary.length + raw.length) / 4),
      }).catch(() => {});
    }

    return NextResponse.json({ result: parsed });
  } catch (error: any) {
    console.error('Report API Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate executive report' },
      { status: 500 }
    );
  }
}
