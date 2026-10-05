import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  generateScriptForTestCase,
  getFileExtension,
  PageDataType as PageData,
} from '../../ai/analyzer';
import { auth as getSession } from '@/auth';
import {
  getDB,
  ensureSchema,
  logUsage,
  getCachedScript,
  setCachedScript,
} from '../../db';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function getCachedPage(url: string): Promise<PageData | null> {
  if (!url || !url.startsWith('http')) return null;
  try {
    await ensureSchema();
    const db = getDB();
    const result = await db`SELECT crawl_result_json, created_at FROM crawl_cache WHERE url = ${url}`;
    if (result.length > 0) {
      const createdAt = new Date(result[0].created_at).getTime();
      if (Date.now() - createdAt < CACHE_TTL_MS) {
        return JSON.parse(result[0].crawl_result_json) as PageData;
      }
    }
  } catch (err) {
    console.warn('DB Cache read error in script route:', err);
  }
  return null;
}

function computeScriptMeta(tc: any, index: number, fw: string, lang: string) {
  const ext = getFileExtension(fw, lang);
  const folder = fw === 'cypress' ? 'cypress/e2e' : 'tests';
  const caseNum = tc.number || index + 1;
  const slug = (tc.name || tc.scenario || `test-${caseNum}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40) || `test-${caseNum}`;

  let fileName = tc.file_name;
  if (!fileName) {
    fileName = `${slug}${ext}`;
  } else {
    fileName = fileName.replace(/\.(spec|cy|test)\.(ts|js)$/i, '').replace(/\.(ts|js|py|cs|java)$/i, '') + ext;
  }

  let scriptLocation = tc.script_location;
  if (!scriptLocation) {
    scriptLocation = `${folder}/${fileName}`;
  } else {
    const dir = scriptLocation.includes('/') ? scriptLocation.slice(0, scriptLocation.lastIndexOf('/')) : folder;
    scriptLocation = `${dir}/${fileName}`;
  }

  return { fileName, scriptLocation, caseNum };
}

function getScriptCacheKey(
  url: string,
  tc: any,
  fw: string,
  lang: string,
  usePom: boolean
): string {
  const raw = [
    (url || '').toLowerCase().trim(),
    (tc.name || tc.scenario || '').trim(),
    (tc.expected_result || '').trim(),
    Array.isArray(tc.test_steps) ? tc.test_steps.join('|') : String(tc.input || ''),
    fw.toLowerCase().trim(),
    lang.toLowerCase().trim(),
    usePom ? 'pom' : 'nopom',
  ].join(':::');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return `script:${fw}:${lang}:${hash}`;
}

function generateFallbackCode(
  tc: any,
  pageUrl: string,
  fw: string,
  lang: string,
  usePom: boolean
): string {
  const name = (tc.name || tc.scenario || 'Test Case').replace(/'/g, "\\'");
  const scenario = tc.scenario || tc.name || '';
  const expected = tc.expected_result || 'Success';

  if (fw === 'cypress') {
    if (usePom) {
      return `// Cypress Page Object Model\nclass TestPage {\n  visit() {\n    cy.visit('${pageUrl}');\n  }\n}\n\nconst testPage = new TestPage();\n\ndescribe('${name}', () => {\n  it('should verify ${scenario}', () => {\n    testPage.visit();\n    // Scenario: ${scenario}\n    // Expected: ${expected}\n  });\n});\n`;
    }
    return `describe('${name}', () => {\n  it('should verify ${scenario}', () => {\n    cy.visit('${pageUrl}');\n    // Scenario: ${scenario}\n    // Expected: ${expected}\n  });\n});\n`;
  }

  // Playwright
  if (usePom) {
    if (lang === 'typescript') {
      return `import { test, expect, Page } from '@playwright/test';\n\nclass TestPage {\n  constructor(private page: Page) {}\n  async goto() {\n    await this.page.goto('${pageUrl}');\n  }\n}\n\ntest('${name}', async ({ page }) => {\n  const testPage = new TestPage(page);\n  await testPage.goto();\n  // Scenario: ${scenario}\n  // Expected: ${expected}\n});\n`;
    }
    return `import { test, expect } from '@playwright/test';\n\nclass TestPage {\n  constructor(page) {\n    this.page = page;\n  }\n  async goto() {\n    await this.page.goto('${pageUrl}');\n  }\n}\n\ntest('${name}', async ({ page }) => {\n  const testPage = new TestPage(page);\n  await testPage.goto();\n  // Scenario: ${scenario}\n  // Expected: ${expected}\n});\n`;
  }

  return `import { test, expect } from '@playwright/test';\n\ntest('${name}', async ({ page }) => {\n  await page.goto('${pageUrl}');\n  // Scenario: ${scenario}\n  // Expected: ${expected}\n});\n`;
}

async function processTestCase(
  tc: any,
  index: number,
  pageData: PageData,
  effectiveContext: string,
  p: string,
  ai_model: string,
  apiKey: string,
  fw: string,
  lang: string,
  publicBaseUrl: string,
  usePom: boolean
) {
  const { fileName, scriptLocation, caseNum } = computeScriptMeta(tc, index, fw, lang);
  const cacheKey = getScriptCacheKey(pageData.url, tc, fw, lang, usePom);

  // 1. Check cache first
  try {
    const cachedScript = await getCachedScript(cacheKey);
    if (cachedScript?.script_code) {
      return {
        script: {
          case_number: caseNum,
          case_name: tc.name || tc.scenario,
          file_name: fileName,
          script_location: scriptLocation,
          framework: fw,
          language: lang,
          code: cachedScript.script_code,
          content: cachedScript.script_code,
          cached: true,
        },
        tokens: 0,
      };
    }
  } catch (cErr) {
    console.warn(`[ScriptCache] Read error for case #${caseNum}:`, cErr);
  }

  // 2. Generate with LLM
  try {
    const scriptRes = await generateScriptForTestCase(
      pageData,
      effectiveContext,
      p,
      ai_model,
      apiKey,
      { ...tc, file_name: fileName, script_location: scriptLocation },
      fw,
      lang,
      publicBaseUrl,
      usePom
    );

    const code = scriptRes.content || (scriptRes as any).code || '';
    if (code) {
      await setCachedScript(cacheKey, code, fw, lang);
    }

    return {
      script: {
        case_number: caseNum,
        case_name: tc.name || tc.scenario,
        file_name: scriptRes.file_name || fileName,
        script_location: scriptRes.script_location || scriptLocation,
        framework: fw,
        language: lang,
        code,
        content: code,
        ...(scriptRes.pom_code ? { pom_code: scriptRes.pom_code } : {}),
        cached: false,
      },
      tokens: scriptRes.tokens_used || 0,
    };
  } catch (err: any) {
    console.error(`Failed to generate script for test case ${caseNum}:`, err);
    const fallbackCode = generateFallbackCode(tc, pageData.url, fw, lang, usePom);
    return {
      script: {
        case_number: caseNum,
        case_name: tc.name || tc.scenario,
        file_name: fileName,
        script_location: scriptLocation,
        framework: fw,
        language: lang,
        code: fallbackCode,
        content: fallbackCode,
        fallback: true,
        cached: false,
      },
      tokens: 0,
    };
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.email) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.email;

    // Detect if SSE streaming is requested
    const urlObj = new URL(request.url);
    const acceptHeader = request.headers.get('accept') || '';
    const queryStream = urlObj.searchParams.get('stream') === 'true';
    const headerStream = acceptHeader.includes('text/event-stream');

    const body = await request.json();
    const isStream = queryStream || headerStream || Boolean(body.stream);

    const {
      url,
      user_context,
      test_cases,
      framework,
      language,
      use_pom,
      usePom,
      ai_provider,
      ai_model,
      api_key,
      nine_router_public_url,
      nine_router_public_key,
    } = body;

    if (!ai_provider || !ai_model) {
      return NextResponse.json({ detail: 'AI Provider & Model are required.' }, { status: 400 });
    }
    if (!test_cases || !Array.isArray(test_cases) || test_cases.length === 0) {
      return NextResponse.json({ detail: 'No test cases provided.' }, { status: 400 });
    }

    const fw = (framework || 'playwright').toLowerCase().trim();
    const lang = (language || 'typescript').toLowerCase().trim();
    const isUsePom = Boolean(use_pom ?? usePom ?? false);

    const p = (ai_provider || 'openai').toLowerCase().trim();
    const publicBaseUrl = p === '9router-public'
      ? String(nine_router_public_url || '').replace(/\/v1\/?$/, '').replace(/\/$/, '')
      : '';
    const apiKey = p === '9router'
      ? (api_key || '9router-local-key')
      : p === '9router-public' ? (nine_router_public_key || '')
      : (api_key || '');

    // Extract target URL from payload or first test case steps
    let targetUrl = url || '';
    if (!targetUrl) {
      for (const tc of test_cases) {
        const stepMatch = (tc.test_steps || []).join(' ').match(/https?:\/\/[^\s"'<>)\]]+/i);
        if (stepMatch) {
          targetUrl = stepMatch[0];
          break;
        }
      }
    }

    const cached = targetUrl ? await getCachedPage(targetUrl) : null;
    const pageData: PageData = cached || {
      title: user_context || targetUrl || 'Web Application',
      url: targetUrl || 'https://example.com',
      elements: [],
    };

    const effectiveContext = user_context || `Test key flows for ${pageData.title || targetUrl}`;
    const casesToProcess = test_cases.slice(0, 15);

    // If SSE streaming requested, stream each script as it finishes
    if (isStream) {
      const encoder = new TextEncoder();
      const customStream = new ReadableStream({
        async start(controller) {
          const sendEvent = (step: string, message: string, extra: Record<string, any> = {}) => {
            const payload = JSON.stringify({ step, message, ...extra });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          };

          let totalTokens = 0;
          const collectedScripts: any[] = [];

          try {
            await Promise.all(
              casesToProcess.map(async (tc: any, index: number) => {
                const result = await processTestCase(
                  tc,
                  index,
                  pageData,
                  effectiveContext,
                  p,
                  ai_model,
                  apiKey,
                  fw,
                  lang,
                  publicBaseUrl,
                  isUsePom
                );

                totalTokens += result.tokens;
                collectedScripts.push(result.script);

                sendEvent('script', `Script for case #${result.script.case_number} ready`, {
                  script: result.script,
                  current: collectedScripts.length,
                  total: casesToProcess.length,
                });
              })
            );

            collectedScripts.sort((a, b) => a.case_number - b.case_number);

            if (userId && totalTokens > 0) {
              await logUsage({
                user_id: userId,
                source: 'test_generation',
                provider: p,
                model: ai_model,
                total_tokens: totalTokens,
              });
            }

            sendEvent('complete', 'Script generation complete', {
              status: 'success',
              framework: fw,
              language: lang,
              scripts: collectedScripts,
              total_tokens: totalTokens,
            });
            controller.close();
          } catch (streamErr: any) {
            sendEvent('error', streamErr.message || 'Stream processing failed');
            controller.close();
          }
        },
      });

      return new Response(customStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // Standard JSON response
    let totalTokens = 0;
    const processed = await Promise.all(
      casesToProcess.map((tc: any, index: number) =>
        processTestCase(
          tc,
          index,
          pageData,
          effectiveContext,
          p,
          ai_model,
          apiKey,
          fw,
          lang,
          publicBaseUrl,
          isUsePom
        )
      )
    );

    const scripts = processed.map(item => {
      totalTokens += item.tokens;
      return item.script;
    });

    scripts.sort((a, b) => a.case_number - b.case_number);

    if (userId && totalTokens > 0) {
      await logUsage({
        user_id: userId,
        source: 'test_generation',
        provider: p,
        model: ai_model,
        total_tokens: totalTokens,
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
