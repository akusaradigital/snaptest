import { NextResponse } from 'next/server';
import { callLLM, UsageOut } from '@/app/api/ai/llm';
import { auth as getSession } from '@/auth';
import { logUsage } from '@/app/api/db';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    const userId = session.user.email;

    const {
      message,
      custom_rules,
      active_test_cases,
      ai_provider,
      ai_model,
      api_key,
      nine_router_public_url,
      nine_router_public_key,
    } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ detail: 'Message is required.' }, { status: 400 });
    }

    if (!ai_provider || !ai_model) {
      return NextResponse.json({ detail: 'AI Provider & Model are required. Please select in AI Settings.' }, { status: 400 });
    }

    const p = (ai_provider || 'openai').toLowerCase().trim();
    const apiKey = p === '9router'
      ? (api_key || '9router-local-key')
      : p === '9router-public' ? (nine_router_public_key || '')
      : (api_key || '');

    const publicBaseUrl = p === '9router-public'
      ? String(nine_router_public_url || '').replace(/\/v1\/?$/, '').replace(/\/$/, '')
      : undefined;

    const systemPrompt = `You are a Principal Test Automation Architect & Senior QA Lead in TestGen Studio.
You act as an intelligent, conversational QA assistant (like Chatbase) with deep knowledge of:
1. End-to-End test automation frameworks (Playwright, Cypress, Robot Framework, Jest).
2. Writing maintainable, resilient automated tests (Page Object Model, stable locators like data-testid/role/label, waiting strategies, network mocking).
3. BDD with Gherkin feature files (Given/When/Then scenarios, scenario outlines).
4. Test triage, diagnosing flaky tests, timeout debugging, and DOM locator repair.
5. Remembering custom QA guidelines and formatting rules for future test generation.

CONVERSATIONAL RULES:
- If the user asks a technical or QA question: Answer clearly, authoritatively, and practically with code snippets or examples using clean Markdown.
- If the user provides a rule/preference/instruction to remember (e.g. phrases starting with "ingat", "remember", "catat", "mulai sekarang"):
  * Extract the core rule cleanly and imperatively into the "remember_rule" field.
  * In "reply", confirm that the rule has been saved to the Test Generator memory, and explain how it will be applied to upcoming generated test cases or scripts.
- If the user greets or asks what you can do: Warmly introduce your capabilities in TestGen Studio (generating automated test cases from live URLs, Figma designs, screenshots, or PRDs; converting cases to Playwright/Gherkin; diagnosing and repairing failed tests).
- If active test cases from the current session are provided in context, feel free to reference or explain them if the user asks about them.
- Language: Match the user's language (reply in Indonesian if user asks in Indonesian, English if in English). Keep technical terms (locator, assertion, hook, fixture, headless, timeout, etc.) natural.

Return ONLY a valid JSON object:
{
  "reply": "Your markdown-formatted conversational answer",
  "remember_rule": "Extracted rule to remember, or null if user did not ask to remember anything"
}
${custom_rules ? `\nACTIVE USER CUSTOM QA RULES & PREFERENCES:\n${custom_rules}\n` : ''}
${active_test_cases ? `\nACTIVE TEST CASES IN THIS SESSION:\n${active_test_cases}\n` : ''}`;

    const usage: UsageOut = {};
    const raw = await callLLM(
      ai_provider,
      ai_model,
      apiKey,
      systemPrompt,
      message,
      true,
      4096,
      usage,
      publicBaseUrl
    );

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) parsed = JSON.parse(match[1]);
      else parsed = { reply: raw, remember_rule: null };
    }

    if (userId) {
      logUsage({
        user_id: userId,
        source: 'test_generation',
        provider: ai_provider,
        model: ai_model,
        total_tokens: usage.totalTokens ?? Math.ceil((message.length + raw.length) / 4),
        cache_read_tokens: usage.cacheReadTokens,
        cache_creation_tokens: usage.cacheCreationTokens,
      });
    }

    return NextResponse.json({
      reply: parsed.reply || raw,
      remember_rule: parsed.remember_rule || null,
    });
  } catch (err: any) {
    console.error('Generate chat error:', err);
    return NextResponse.json(
      { detail: err.message || 'Failed to process chat message' },
      { status: 500 }
    );
  }
}
