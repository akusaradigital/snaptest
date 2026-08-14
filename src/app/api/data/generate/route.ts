import { NextResponse } from 'next/server';
import { callLLM } from '@/app/api/ai/llm';
import { logUsage } from '../../db';
import { auth } from '@/auth';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    const userId = session.user.email;
    const body = await req.json();
    const { prompt, ai_provider, ai_model, api_key } = body;

    if (!prompt || !ai_provider || !ai_model || !api_key) {
      return NextResponse.json({ detail: 'Missing required fields' }, { status: 400 });
    }

    const systemPrompt =
      "You are a senior QA Engineer specializing in test data generation. Given a field description or JSON schema, generate a realistic set of mock records covering happy-path, boundary, and negative/edge cases.\n\nReturn ONLY a valid JSON array of record objects, e.g.:\n[\n  { \"field1\": \"value\", \"field2\": 123 },\n  { \"field1\": \"edge-case-value\", \"field2\": -1 }\n]\n\nGenerate at least 8 records. Do not wrap the array in an object, and do not include any explanation outside the JSON.";

    const raw = await callLLM(
      ai_provider,
      ai_model,
      api_key,
      systemPrompt,
      prompt,
      true,
      4096
    );

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('LLM response was not valid JSON');
      }
    }

    if (data && !Array.isArray(data) && Array.isArray(data.data)) {
      data = data.data;
    }
    if (!Array.isArray(data)) {
      throw new Error('LLM response was not a JSON array');
    }

    if (userId) {
      await logUsage({
        user_id: userId,
        source: 'data_generation',
        provider: ai_provider,
        model: ai_model,
        total_tokens: Math.ceil((prompt.length + raw.length) / 4),
      });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('DataGen API Error:', error);
    return NextResponse.json(
      { detail: error.message || 'Failed to generate test data' },
      { status: 500 }
    );
  }
}
