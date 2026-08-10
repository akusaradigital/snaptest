import { NextResponse } from 'next/server';
import { crawlPage, screenshotPage, PageData, DOMElement } from '../../crawler';
import { generateTestCases, generateScriptForTestCase, getFileExtension } from '../../ai/analyzer';
import { callVisionLLM, supportsVision } from '../../ai/llm';
import { getDB, ensureSchema, logUsage } from '../../db';
import { auth as getSession } from '@/auth';
import crypto from 'crypto';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getCachedPage(url: string, authConfig?: unknown): Promise<PageData | null> {
  if (authConfig) return null; // Never cache authenticated crawls
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
    console.warn("DB Cache read error:", err);
  }
  return null;
}

async function setCachedPage(url: string, data: PageData, authConfig?: unknown) {
  if (authConfig) return; // Never cache authenticated crawls
  try {
    await ensureSchema();
    const db = getDB();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const jsonStr = JSON.stringify(data);
    await db`
      INSERT INTO crawl_cache (id, url, crawl_result_json, created_at)
      VALUES (${id}, ${url}, ${jsonStr}, ${now})
      ON CONFLICT (url) DO UPDATE SET 
        crawl_result_json = ${jsonStr},
        created_at = ${now}
    `;
  } catch (err) {
    console.warn("DB Cache write error:", err);
  }
}

function deriveFields(tc: any, url: string, caseSlug: string, framework: string, language: string) {
  const s = (tc.scenario || '').toLowerCase();

  let type = 'POSITIVE';
  if (/invalid|wrong|incorrect|fail|error|empty|blank|missing|404|forbidden|unauthorized|reject/.test(s)) type = 'NEGATIVE';
  else if (/security|sql.inject|xss|csrf|privilege|bypass/.test(s)) type = 'SECURITY';
  else if (/boundary|limit|max|min|overflow|exact/.test(s)) type = 'BOUNDARY';
  else if (/edge|unusual|unexpected|corner/.test(s)) type = 'EDGE';

  let priority = 'MEDIUM';
  if (/login|auth|payment|checkout|password|register/.test(s)) priority = 'CRITICAL';
  else if (/submit|save|create|delete|update|search|upload/.test(s)) priority = 'HIGH';
  else if (/display|style|layout|hover|tooltip|visual/.test(s)) priority = 'LOW';

  const name = (tc.scenario || `Test Case ${tc.number}`)
    .replace(/\b(\w)/g, (c: string) => c.toUpperCase())
    .substring(0, 80);

  const pre_condition = type === 'SECURITY'
    ? 'Browser is open, developer tools available, application is accessible'
    : 'Browser is open, application URL is accessible';

  const test_steps = [
    `Open ${url}`,
    tc.scenario || 'Perform the test action',
    `Verify: ${tc.expected_result || 'Expected behavior occurs'}`,
  ];

  const slug = (tc.scenario || `test-${tc.number}`)
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 40);
  const ext = getFileExtension(framework, language);
  const file_name = `${caseSlug}-${slug}${ext}`;
  const script_location = `tests/${caseSlug}/${file_name}`;

  return { ...tc, type, priority, name, pre_condition, test_steps, file_name, script_location };
}

function getCaseId(tc: any, index: number): string {
  const prefix = (tc.file_name || 'TST').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'TST';
  return `${prefix}-${String(index + 1).padStart(3, '0')}`;
}

function formatTestCaseTable(testCases: any[]): string {
  const header = "| # | Test Case ID | Test Case Name | Type | Pre Condition | Test Steps | Expected Result | Actual Result | Status | Priority | Evidence |";
  const separator = "|---|---|---|---|---|---|---|---|---|---|---|";
  const rows = testCases.map((tc, i) => {
    const steps = Array.isArray(tc.test_steps) ? tc.test_steps.map((s: string, n: number) => `${n + 1}. ${s}`).join('<br>') : (tc.input || '');
    return `| ${tc.number || i + 1} | ${getCaseId(tc, i)} | ${tc.name || tc.scenario || ''} | ${tc.type || ''} | ${tc.pre_condition || ''} | ${steps} | ${tc.expected_result || ''} | - | - | ${tc.priority || ''} | - |`;
  });
  return [header, separator, ...rows].join('\n');
}

export async function POST(request: Request) {
		  try {
		    const session = await getSession();
		    if (!session?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
		    const userId = session.user.email;
		    const { url, user_context, document_title, document_text, document_image_base64, ai_provider, ai_model, api_key, auth, framework, language, generation_mode, output_mode, crawl_mode, nine_router_public_url, nine_router_public_key } = await request.json();
		    if (!ai_provider) return NextResponse.json({ detail: 'AI Provider is required. Please select one in AI Settings.' }, { status: 400 });
		    if (!ai_model) return NextResponse.json({ detail: 'AI Model is required. Please select one in AI Settings.' }, { status: 400 });
    const modeMinTC: Record<string, number> = { quick: 10, standard: 30, thorough: 50 };
    const minTestCases = modeMinTC[generation_mode] ?? 10;
    const now = new Date();
    const runTs = `${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}${now.getFullYear()}`;
    let domain = 'doc';
    let pathPart = 'input';
    try {
      if (url && url.startsWith('http')) {
        const parsed = new URL(url);
        domain = parsed.hostname.replace(/^www\./, '').split('.').slice(0, -1).join('-');
        pathPart = parsed.pathname.replace(/\//g, '-').replace(/^-|-$/g, '');
      }
    } catch {}
    const runSlug = [domain, pathPart].filter(Boolean).join('-');
    const runFolder = `tests/results/${runSlug}-${runTs}`;
    const encoder = new TextEncoder();

    const customStream = new ReadableStream({
      async start(controller) {
        const sendEvent = (step: string, message: string, extra: Record<string, any> = {}) => {
          const payload = JSON.stringify({ step, message, ...extra });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        };

        try {
          const p = (ai_provider || 'openai').toLowerCase().trim();
          const publicBaseUrl = p === '9router-public'
            ? String(nine_router_public_url || '').replace(/\/v1\/?$/, '').replace(/\/$/, '')
            : '';
          // ponytail: keys are client-side only - sent per request, never stored server-side
          const apiKey = p === '9router'
            ? (api_key || '9router-local-key')
            : p === '9router-public' ? (nine_router_public_key || '')
            : (api_key || '');

          // The selected model is an explicit user choice; modes may change output size, not the model.
          const stage1Model = ai_model || '';
          const stage2Model = ai_model || '';

          // Step 1: Crawl / Screenshot / Document Parsing
          const cached = await getCachedPage(url, auth);
          let pageData: PageData;

          if (crawl_mode === 'document') {
            if (document_image_base64) {
              if (!supportsVision(p, ai_model || '')) {
                sendEvent('error', `Model "${ai_model}" does not support Vision. Please use GPT-4o, Claude 3+, or Gemini to process image designs.`);
                controller.close();
                return;
              }
              sendEvent('analyzing', 'AI analyzing design image / Figma rendering...');
              const visionUsage = { totalTokens: 0 };
              const visionSystem = `You are a UI/UX analyst. Analyze the design mockup / screenshot and extract interactive elements. Return ONLY JSON: {"elements":[{"tag":"button|input|a|select","text_content":"","placeholder":"","css_selector":""}]}`;
              const visionPrompt = `Analyze this design image. Identify interactive UI elements (inputs, buttons, dropdowns, links) and return JSON format.`;
              let visionRaw = '';
              try {
                visionRaw = await callVisionLLM(p, ai_model || '', apiKey, visionSystem, visionPrompt, document_image_base64, 2048, visionUsage, publicBaseUrl);
              } catch (err: any) {
                sendEvent('error', `Vision AI error: ${err.message}`);
                controller.close();
                return;
              }
              let visionElements: DOMElement[] = [];
              try {
                const jsonMatch = visionRaw.match(/\{[\s\S]*\}/);
                const parsed = JSON.parse(jsonMatch?.[0] || visionRaw);
                visionElements = (parsed.elements || []).map((el: any): DOMElement => ({
                  tag: el.tag || 'button',
                  id: el.id || null,
                  name: el.name || null,
                  type: el.type || null,
                  placeholder: el.placeholder || null,
                  aria_label: el.aria_label || null,
                  label_text: null,
                  text_content: (el.text_content || '').substring(0, 40) || null,
                  css_selector: el.css_selector || el.tag || 'button',
                }));
              } catch {}
              pageData = { title: document_title || 'Design Mockup', url: url || 'document://image', elements: visionElements };
              sendEvent('crawled', `Extracted ${visionElements.length} elements from design image`, {
                elements_found: visionElements.length,
                page_title: pageData.title,
                from_cache: false,
              });
            } else {
              sendEvent('crawling', 'Processing document text...');
              pageData = { title: document_title || 'PRD / Specification Document', url: url || 'document://text', elements: [] };
              sendEvent('crawled', `Document text ready for analysis`, {
                elements_found: 0,
                page_title: pageData.title,
                from_cache: false,
              });
            }
          } else if (crawl_mode === 'vision') {
            // Vision mode: screenshot → Vision AI extract elements
            if (!supportsVision(p, ai_model || '')) {
              sendEvent('error', `Model "${ai_model}" does not support Vision. Please use GPT-4o, Claude 3+, or Gemini for this mode.`);
              controller.close();
              return;
            }
            const serviceUrl = process.env.CRAWLER_URL?.replace(/\/$/, '');
            if (!serviceUrl) {
              sendEvent('error', 'Vision mode requires the Playwright crawler service (CRAWLER_URL is not configured).');
              controller.close();
              return;
            }
            sendEvent('crawling', 'Taking screenshot of page...');
            let screenshotData: { title: string; screenshot: string };
            try {
              screenshotData = await screenshotPage(url, auth, serviceUrl);
            } catch (err: any) {
              if (err.code === 'CRAWLER_QUEUED') {
                sendEvent('error', 'Crawler is at full capacity (2/2 slots in use). Please try again later or switch to Static mode.');
                controller.close();
                return;
              }
              throw err;
            }
            sendEvent('analyzing', 'AI analyzing screenshot to identify UI elements...');
            const visionUsage = { totalTokens: 0 };
            const visionSystem = `You are a web UI analyst. Analyze the screenshot and extract all visible interactive elements. Return ONLY a valid JSON object: {"elements":[{"tag":"input|button|a|select|textarea","type":"","text_content":"","placeholder":"","aria_label":"","id":"","name":"","css_selector":""}]}`;
            const visionPrompt = `Analyze this web page screenshot. Identify ALL visible interactive elements (inputs, buttons, links, dropdowns, checkboxes, etc.) and return JSON. For css_selector, use the best guess (#id, [name=x], button:has-text, etc).`;
            let visionRaw = '';
            try {
              visionRaw = await callVisionLLM(p, ai_model || '', apiKey, visionSystem, visionPrompt, screenshotData.screenshot, 2048, visionUsage, publicBaseUrl);
            } catch (err: any) {
              sendEvent('error', `Vision AI error: ${err.message}`);
              controller.close();
              return;
            }
            let visionElements: DOMElement[] = [];
            try {
              const jsonMatch = visionRaw.match(/\{[\s\S]*\}/);
              const parsed = JSON.parse(jsonMatch?.[0] || visionRaw);
              visionElements = (parsed.elements || []).map((el: any): DOMElement => ({
                tag: el.tag || 'button',
                id: el.id || null,
                name: el.name || null,
                type: el.type || null,
                placeholder: el.placeholder || null,
                aria_label: el.aria_label || null,
                label_text: null,
                text_content: (el.text_content || '').substring(0, 40) || null,
                css_selector: el.css_selector || el.tag || 'button',
              }));
            } catch {
              sendEvent('error', 'Vision AI returned invalid response. Try again or switch to Playwright mode.');
              controller.close();
              return;
            }
            pageData = { title: screenshotData.title, url, elements: visionElements };
            await setCachedPage(url, pageData, auth);
            sendEvent('crawled', `Vision AI identified ${visionElements.length} UI elements`, {
              elements_found: visionElements.length,
              page_title: screenshotData.title,
              from_cache: false,
            });
          } else if (cached) {
            sendEvent('crawling', 'Loading page data from cache...');
            pageData = cached;
            sendEvent('crawled', `Cache hit: ${pageData.elements.length} elements found`, {
              elements_found: pageData.elements.length,
              page_title: pageData.title,
              from_cache: true
            });
          } else {
            sendEvent('crawling', 'Crawling page and extracting elements...');
            try {
              pageData = await crawlPage(url, auth, crawl_mode);
            } catch (err: any) {
              if (err.code === 'CRAWLER_QUEUED') {
                sendEvent('error', 'Crawler is at full capacity (2/2 slots in use). Please try again later or switch to Static mode.', { crawler_busy: true });
                controller.close();
                return;
              }
              throw err;
            }
            if (!pageData.elements || pageData.elements.length === 0) {
              sendEvent('error', 'No interactive elements found. This page may render its content with JavaScript (SPA), which static crawling cannot read - try a server-rendered page or the page that holds the actual form.');
              controller.close();
              return;
            }
            await setCachedPage(url, pageData, auth);
            sendEvent('crawled', `Found ${pageData.elements.length} interactive elements`, {
              elements_found: pageData.elements.length,
              page_title: pageData.title,
              from_cache: false
            });
          }

          // Default context from page title/URL if user left it blank
          const effectiveContext = (user_context || '').trim() ||
            `Test all interactive elements and key user flows on this page: ${pageData.title || url}`;

          // Step 2: AI Generate Test Cases (Stage 1)
          sendEvent('analyzing', 'AI is generating test cases...');
          const { testCases: rawTestCases, tokens: tcTokens } = await generateTestCases(
            pageData,
            effectiveContext,
            p,
            stage1Model,
            apiKey,
            '',
            minTestCases,
            publicBaseUrl
          );
          const testCases = rawTestCases.map((tc: any) => deriveFields(tc, url, runSlug, framework || 'playwright', language || 'typescript'));

          sendEvent('analyzed', `${testCases.length} test cases generated.`);

          const table = formatTestCaseTable(testCases);
          // 'scripts' mode: skip showing TC table to user
          if (output_mode !== 'scripts') {
            sendEvent('table', 'Test cases ready!', {
              test_cases: testCases,
              test_case_table: table,
              page_title: pageData.title,
              elements_found: pageData.elements.length
            });
          }

          // 'cases' mode: stop here, no script generation
          let totalTokens = tcTokens;
          const scripts: any[] = [];

          if (output_mode !== 'cases') {
            // Step 3: AI Generate Scripts (Stage 2 - Parallel)
            let completedCount = 0;

            const runWithConcurrencyLimit = async (limit: number, items: any[], fn: (item: any) => Promise<any>) => {
              const executing = new Set<Promise<any>>();
              const results: Promise<any>[] = [];
              for (const item of items) {
                const pr = Promise.resolve().then(() => fn(item));
                results.push(pr);
                executing.add(pr);
                const clean = () => executing.delete(pr);
                pr.then(clean, clean);
                if (executing.size >= limit) await Promise.race(executing);
              }
              return Promise.all(results);
            };

            const processTestCase = async (tc: any) => {
              sendEvent('formatting', `Generating script ${tc.number}/${testCases.length}...`);
              const script = await generateScriptForTestCase(
                pageData, effectiveContext, p, stage2Model, apiKey,
                tc, framework || 'playwright', language || 'typescript',
                publicBaseUrl
              );
              if (script.file_name) script.script_location = `${runFolder}/${script.file_name}`;
              totalTokens += script.tokens_used || 0;
              completedCount++;
              sendEvent('script_complete', `Script ${completedCount}/${testCases.length} done`, {
                script, completed: completedCount, total: testCases.length
              });
              scripts.push(script);
            };

            await runWithConcurrencyLimit(8, testCases, processTestCase);
          }

          const id = crypto.randomUUID();
          const now = new Date().toISOString();

          // Only persist history for signed-in users (guests can generate but nothing is saved)
          if (userId) {
            await ensureSchema();
            const sql = getDB();
            await sql`INSERT INTO history
               (id, url, user_context, page_title, elements_found, ai_provider, ai_model,
                test_case_table, test_cases_json, scripts_json, scripts_count, created_at, updated_at, user_id)
               VALUES (${id}, ${url}, ${effectiveContext}, ${pageData.title}, ${pageData.elements.length}, ${p}, ${ai_model || ''},
                ${table}, ${JSON.stringify(testCases)}, ${JSON.stringify(scripts)}, ${scripts.length}, ${now}, ${now}, ${userId})`;

            await logUsage({
              user_id: userId,
              source: 'test_generation',
              provider: p,
              model: ai_model,
              total_tokens: totalTokens,
            });
          }

          sendEvent('complete', 'Generation complete!', {
            result: {
              url,
              history_id: userId ? id : undefined,
              test_case_table: table,
              scripts,
              test_cases: testCases,
              page_title: pageData.title,
              elements_found: pageData.elements.length,
              tokens_used: totalTokens
            }
          });
          controller.close();
        } catch (err: any) {
          sendEvent('error', err.message);
          controller.close();
        }
      }
    });

    return new Response(customStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
