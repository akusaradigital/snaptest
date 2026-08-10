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
      command,
      ai_provider,
      ai_model,
      api_key,
      nine_router_public_url,
      nine_router_public_key,
    } = body;

    if (!command || !ai_provider || !ai_model || !api_key) {
      return NextResponse.json(
        { error: 'Missing required fields: command, ai_provider, ai_model, api_key' },
        { status: 400 }
      );
    }

    const systemPrompt =
      "You are the AI QA Squad Leader. Given a high-level command from a QA engineer, create an orchestration plan and execute it across specialized agents.\n\nAvailable Sub-Agents:\n1. test_cases: Generate UI test cases and Playwright/Cypress scripts\n2. test_data: Generate mock data, boundary, and negative payloads\n3. api_test: Generate API test suite and Postman collection\n4. test_planner: Generate PRD test matrix and effort estimation\n5. script_repair: Self-heal broken selectors or code errors\n6. coverage_check: Analyze requirements vs test coverage\n\nReturn ONLY a valid JSON object:\n{\n  \"plan_summary\": \"1-sentence executive summary of the squad plan\",\n  \"steps\": [\n    {\n      \"step_number\": 1,\n      \"agent\": \"test_cases|test_data|api_test|test_planner|script_repair|coverage_check\",\n      \"agent_name\": \"Test Case Agent | Test Data Generator | API Test Agent | Test Planner | Script Repair | Coverage Checker\",\n      \"action_summary\": \"What this sub-agent will generate\",\n      \"output_preview\": \"Structured text output / code / table content generated for this step\"\n    }\n  ],\n  \"unified_markdown\": \"Full consolidated markdown report combining all agent findings\"\n}";

    const userPrompt = `High-Level Command: ${command}`;

    const raw = await callLLM(
      ai_provider,
      ai_model,
      api_key,
      systemPrompt,
      userPrompt,
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
        total_tokens: Math.ceil((command.length + raw.length) / 4),
      });
    }

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error('Squad API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to orchestrate squad' },
      { status: 500 }
    );
  }
}
