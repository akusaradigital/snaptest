import { NextResponse } from 'next/server';
import { callLLM } from '@/app/api/ai/llm';
import { logUsage } from '../../db';
import { auth } from '@/auth';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.email;
    const body = await req.json();
    const {
      input,
      input_type,
      ai_provider,
      ai_model,
      api_key,
      nine_router_public_url,
      nine_router_public_key,
    } = body;

    if (!input || !input_type || !ai_provider || !ai_model || !api_key) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const validTypes = ['curl', 'openapi', 'postman', 'manual'];
    if (!validTypes.includes(input_type)) {
      return NextResponse.json(
        { error: 'Invalid input_type. Must be one of: curl, openapi, postman, manual' },
        { status: 400 }
      );
    }

    const systemPrompt =
      "You are a senior QA Engineer specializing in API Testing. Given the input (cURL, OpenAPI spec, Postman collection, or manual description), generate comprehensive API test suites. For multi-path inputs like OpenAPI specs, generate a suite for each endpoint.\n\nReturn ONLY a valid JSON object with this exact structure:\n{\n  \"suites\": [\n    {\n      \"endpoint\": \"string\",\n      \"method\": \"GET|POST|PUT|DELETE|PATCH\",\n      \"base_url\": \"string\",\n      \"test_cases\": [\n        {\n          \"id\": \"TC-001\",\n          \"name\": \"string\",\n          \"category\": \"Happy Path|Auth|Validation|Error Handling|Edge Case|Security\",\n          \"description\": \"string\",\n          \"request\": {\n            \"headers\": {},\n            \"body\": {},\n            \"params\": {}\n          },\n          \"expected_status\": 200,\n          \"expected_response\": \"string\",\n          \"priority\": \"Critical|High|Medium|Low\"\n        }\n      ],\n      \"postman_collection\": { ... valid Postman Collection v2.1 JSON ... }\n    }\n  ]\n}";

    const userPrompt = `Input Type: ${input_type}\n\nInput:\n${input}`;

    const raw = await callLLM(
      ai_provider,
      ai_model,
      api_key,
      systemPrompt,
      userPrompt,
      true,
      8192,
      undefined,
      nine_router_public_url || undefined
    );

    let result: any;
    try {
      result = JSON.parse(raw);
    } catch {
      // Try to extract JSON from markdown code block if direct parse fails
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('LLM response was not valid JSON');
      }
    }

    // Fallback: if the LLM returned the old single-suite format, wrap it in a suites array
    if (result && !result.suites && (result.test_cases || result.endpoint)) {
      result = { suites: [result] };
    }

    if (userId) {
      await logUsage({
        user_id: userId,
        source: 'api_agent',
        provider: ai_provider,
        model: ai_model,
        total_tokens: Math.ceil((input.length + raw.length) / 4),
      });
    }

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error('ApiAgent API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate API test suite' },
      { status: 500 }
    );
  }
}