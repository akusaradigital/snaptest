import { NextResponse } from 'next/server';
import { callLLM } from '@/app/api/ai/llm';
import { logUsage } from '../db';
import { auth } from '@/auth';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.email;
    const body = await req.json();
    const {
      input,
      ai_provider,
      ai_model,
      api_key,
      nine_router_public_url,
      nine_router_public_key,
    } = body;

    if (!input || !ai_provider || !ai_model || (ai_provider !== '9router-public' && !api_key)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    if (ai_provider === '9router-public' && !nine_router_public_url) {
      return NextResponse.json({ error: '9Router Public URL is required' }, { status: 400 });
    }

    const systemPrompt = `You are a senior QA Engineer. The user will give you a document (PRD, User Story, Acceptance Criteria, Gherkin, Feature Description, or plain text). You MUST auto-detect the document format yourself — do NOT ask the user what format it is.

Return ONLY a valid JSON object with this structure:
{
  "detected_format": "PRD | User Story | Acceptance Criteria | Gherkin | Feature Description | Plain Text",
  "feature_name": "Short feature name extracted from the document",
  "test_matrix": [
    {
      "id": "TC-001",
      "category": "Positive | Negative | Edge Case | Security | Boundary",
      "scenario": "Test scenario title",
      "steps": ["Step 1", "Step 2"],
      "expected": "Expected result",
      "priority": "Critical | High | Medium | Low",
      "effort_hours": 0.5
    }
  ],
  "total_effort_hours": 4.5,
  "coverage_summary": "Brief 1-2 sentence summary of coverage"
}`;

    const raw = await callLLM(
      ai_provider,
      ai_model,
      ai_provider === '9router-public' ? (nine_router_public_key || api_key || '') : api_key,
      systemPrompt,
      input,
      true,
      4096,
      undefined,
      nine_router_public_url || undefined
    );

    let result: any;
    try {
      result = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('LLM response was not valid JSON');
      }
    }

    if (userId) {
      await logUsage({
        user_id: userId,
        source: 'test_generation',
        provider: ai_provider,
        model: ai_model,
        total_tokens: Math.ceil((input.length + raw.length) / 4),
      });
    }

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error('Planner API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate test plan' },
      { status: 500 }
    );
  }
}
