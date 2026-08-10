import { NextResponse } from 'next/server';
import { generateScriptForTestCase, getFastModel } from '../../ai/analyzer';
import { auth as getSession } from '@/auth';
import { logUsage } from '../../db';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    const userId = session.user.email;
    const { test_cases, framework, language, ai_provider, ai_model, api_key, nine_router_public_url, nine_router_public_key } = await request.json();

    if (!ai_provider || !ai_model) {
      return NextResponse.json({ detail: 'AI Provider & Model are required.' }, { status: 400 });
    }
    if (!test_cases || !Array.isArray(test_cases) || test_cases.length === 0) {
      return NextResponse.json({ detail: 'No test cases provided.' }, { status: 400 });
    }

    const fw = framework || 'playwright';
    const lang = language || 'typescript';

    // Generate scripts for the provided test cases
    const scripts = await Promise.all(
      test_cases.slice(0, 15).map(async (tc: any) => {
        const code = await generateScriptForTestCase(
          tc,
          fw,
          lang,
          ai_provider,
          ai_model,
          api_key,
          nine_router_public_url,
          nine_router_public_key
        );
        return {
          case_number: tc.number,
          case_name: tc.name || tc.scenario,
          file_name: tc.file_name || `test-${tc.number}.spec.ts`,
          script_location: tc.script_location || `tests/test-${tc.number}.spec.ts`,
          framework: fw,
          language: lang,
          code,
        };
      })
    );

    if (userId) {
      logUsage({
        user_id: userId,
        source: 'test_generation',
        provider: ai_provider,
        model: ai_model,
        total_tokens: test_cases.length * 150,
      });
    }

    return NextResponse.json({
      status: 'success',
      framework: fw,
      language: lang,
      scripts,
    });
  } catch (error: any) {
    console.error('Generate script endpoint error:', error);
    return NextResponse.json({ detail: error.message || 'Script generation failed' }, { status: 500 });
  }
}
