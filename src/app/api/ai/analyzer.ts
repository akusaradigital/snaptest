import { DOMElement, PageData } from '../crawler';
import { callLLM } from './llm';

export interface ScriptFile {
  file_name: string;
  script_location: string;
  content: string;
}

export interface ElementRef {
  originalIndex: number;
  el: DOMElement;
}

const TC_BATCH_SIZE = 20;
const TC_MAX_OUTPUT_TOKENS = 3500;
const SCRIPT_MAX_OUTPUT_TOKENS = 3000;
const MAX_FIELD_CHARS = 90;
const MAX_LINK_TEXT_CHARS = 36;

function compactText(value: unknown, maxLength: number = MAX_FIELD_CHARS): string {
  if (!value) return '';
  const text = String(value)
    .replace(/\s+/g, ' ')
    .replace(/["`]/g, "'")
    .trim();

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function extractCaseSlug(userContext: string): string {
  const text = userContext.toLowerCase();

  const mapped: [RegExp, string][] = [
    [/login|signin|sign.?in/, 'login'],
    [/register|signup|sign.?up/, 'register'],
    [/logout|sign.?out/, 'logout'],
    [/search/, 'search'],
    [/checkout|payment/, 'checkout'],
    [/profile/, 'profile'],
    [/settings/, 'settings'],
    [/upload/, 'upload'],
    [/filter|category|sort/, 'filter'],
    [/navigation|menu|navbar/, 'navigation'],
    [/form/, 'form'],
  ];

  for (const [re, slug] of mapped) {
    if (re.test(text)) return slug;
  }

  const words = text.match(/\b[a-z]+\b/g)?.slice(0, 2);
  return words?.join('-') || 'test';
}

function getElementSearchText(el: DOMElement): string {
  return [
    el.id,
    el.name,
    el.type,
    el.placeholder,
    el.aria_label,
    el.label_text,
    el.text_content,
    el.css_selector,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

// Keeps original DOM indices while pruning. This prevents relevant_indices from pointing to the wrong element later.
export function filterElementRefsByContext(
  elements: DOMElement[],
  userContext: string
): ElementRef[] {
  const refs = elements.map((el, originalIndex) => ({ el, originalIndex }));
  const ctx = userContext.toLowerCase();

  const domainFilters: Array<{ trigger: RegExp; keep: RegExp }> = [
    { trigger: /login|signin|sign in|masuk/, keep: /login|signin|email|e-mail|password|username|user|pass|submit|enter|remember|forgot/ },
    { trigger: /register|signup|sign up|daftar/, keep: /register|signup|name|email|e-mail|password|confirm|phone|dob|birth|submit|terms/ },
    { trigger: /search|cari|pencarian/, keep: /search|query|find|keyword|filter|submit|button|input/ },
    { trigger: /checkout|payment|bayar|cart|keranjang/, keep: /checkout|payment|card|cvv|expiry|billing|submit|pay|address|cart|quantity|coupon|voucher/ },
    { trigger: /upload|unggah|file|attach/, keep: /upload|file|attach|browse|submit|dropzone|image|document/ },
    { trigger: /profile|settings|pengaturan|profil/, keep: /profile|name|bio|email|phone|save|update|submit|settings|avatar/ },
    { trigger: /filter|sort|kategori|category|saring/, keep: /filter|sort|category|price|range|apply|select|dropdown|checkbox|radio/ },
    { trigger: /navigation|menu|navbar|navigasi/, keep: /nav|menu|link|home|about|contact|category|hamburger|sidebar|header|footer/ },
    { trigger: /faq|accordion|question|pertanyaan/, keep: /faq|accordion|question|answer|collapse|expand|button/ },
    { trigger: /security|keamanan|xss|sql|injection/, keep: /input|textarea|form|search|email|password|comment|submit|button|query|field/ },
  ];

  for (const { trigger, keep } of domainFilters) {
    if (!trigger.test(ctx)) continue;

    const filtered = refs.filter(({ el }) => keep.test(getElementSearchText(el)));

    // Only apply pruning when it meaningfully reduces noise but still leaves enough elements.
    if (filtered.length >= 2) return filtered;
  }

  return refs;
}


export function formatElementRefs(refs: ElementRef[], includeSelector: boolean = true): string {
  return refs
    .map(({ el, originalIndex }) => {
      const parts = [`#${originalIndex}`, `<${el.tag}>`];

      if (el.type) parts.push(`type=${compactText(el.type, 32)}`);
      if (el.id) parts.push(`id=${compactText(el.id, 64)}`);
      if (el.name) parts.push(`name=${compactText(el.name, 64)}`);
      if (el.placeholder) parts.push(`ph='${compactText(el.placeholder)}'`);
      if (el.aria_label) parts.push(`aria='${compactText(el.aria_label)}'`);
      if (el.label_text) parts.push(`label='${compactText(el.label_text)}'`);

      if ((el.tag === 'button' || el.tag === 'a') && el.text_content) {
        parts.push(`text='${compactText(el.text_content, MAX_LINK_TEXT_CHARS)}'`);
      }

      if (includeSelector && el.css_selector) {
        parts.push(`selector='${compactText(el.css_selector, 140)}'`);
      }

      return parts.join(' ');
    })
    .join('\n');
}

// Backward-compatible formatter.
export function formatElements(elements: DOMElement[], includeSelector: boolean = true): string {
  const refs = elements.map((el, originalIndex) => ({ el, originalIndex }));
  return formatElementRefs(refs, includeSelector);
}

export function stripCodeFences(content: string): string {
  let cleaned = content.trim();

  if (cleaned.startsWith('```')) {
    const parts = cleaned.split('\n');

    if (parts[0].startsWith('```')) {
      parts.shift();
    }

    if (parts.length && parts[parts.length - 1].trim().startsWith('```')) {
      parts.pop();
    }

    cleaned = parts.join('\n').trim();
  }

  return cleaned;
}

function extractJSONObject(content: string): string {
  const cleaned = stripCodeFences(content);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start >= 0 && end > start) {
    return cleaned.slice(start, end + 1).trim();
  }

  return cleaned;
}

export function parseJSONSafe<T>(content: string): T {
  const cleaned = extractJSONObject(content);

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.warn('Initial JSON parse failed. Attempting cleanup...', err);

    const repaired = cleaned
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");

    try {
      return JSON.parse(repaired) as T;
    } catch (err2) {
      throw new Error(`JSON parse error: ${err2} (raw content: ${content})`);
    }
  }
}

export function getFileExtension(fw: string, lang: string): string {
  const f = fw.toLowerCase();
  const l = lang.toLowerCase();

  if (f === 'cypress') return l === 'typescript' ? '.cy.ts' : '.cy.js';

  if (f === 'selenium') {
    if (l === 'python') return '.py';
    if (l === 'java') return '.java';
    if (l === 'csharp' || l === 'c#') return '.cs';
    return '.js';
  }

  if (l === 'python') return '.py';
  return l === 'typescript' ? '.spec.ts' : '.spec.js';
}

export function getFrameworkRules(fw: string, lang: string): string {
  const f = fw.toLowerCase();
  const l = lang.toLowerCase();

  if (f === 'cypress') {
    return [
      `Use Cypress with ${l === 'typescript' ? 'TypeScript' : 'JavaScript'}.`,
      'Use describe/it, cy.visit, cy.get, cy.contains, and should/expect assertions.',
      'Keep selectors stable and readable.',
    ].join('\n- ');
  }

  if (f === 'selenium') {
    return [
      `Use Selenium WebDriver with ${lang.toUpperCase()}.`,
      'Initialize the driver, open the URL, interact with elements, assert results, then quit the driver.',
      `Include required Selenium imports for ${lang.toUpperCase()}.`,
    ].join('\n- ');
  }

  return [
    `Use Playwright with ${lang.toUpperCase()}.`,
    'Use the standard test runner style for the selected language.',
    'Navigate to the URL, interact with elements, then assert the expected result.',
  ].join('\n- ');
}

// ponytail: fast_model == same model user already chose; no hardcoded model names
export function getFastModel(provider: string, model: string): string {
  return model || '';
}

function getBatchFocus(batchNum: number): string {
  const focuses = [
    'happy path and core functional validation',
    'negative input, invalid data, and validation errors',
    'empty states, boundary values, and missing required fields',
    'basic security cases such as XSS or SQL injection only when relevant',
    'UI state, loading behavior, navigation, and asynchronous behavior',
  ];

  return focuses[batchNum % focuses.length];
}

function normalizeTestCase(tc: any, index: number): any {
  const relevantIndices = Array.isArray(tc.relevant_indices)
    ? tc.relevant_indices
        .map((idx: any) => Number(idx))
        .filter((idx: number) => Number.isInteger(idx) && idx >= 0)
    : [];

  return {
    ...tc,
    number: index + 1,
    scenario: compactText(tc.scenario, 240),
    input: compactText(tc.input, 240),
    expected_result: compactText(tc.expected_result, 260),
    relevant_indices: Array.from(new Set(relevantIndices)),
  };
}

export async function generateTestCases(
  pageData: PageData,
  userContext: string,
  provider: string,
  model: string,
  apiKey: string,
  customPrompt: string = '',
  minTestCases: number = 10,
  publicBaseUrl: string = ''
): Promise<{ testCases: any[]; tokens: number }> {
  const effectiveContext = customPrompt
    ? `${userContext}\nAdditional instructions: ${customPrompt}`
    : userContext;

  // Stage 1 sends pruned DOM without selectors to reduce input tokens.
  // Important: we keep original indices, so Stage 2 can find the correct elements.
  const prunedElementRefs = filterElementRefsByContext(pageData.elements, effectiveContext);
  const elementsStr = formatElementRefs(prunedElementRefs, false);

  const tcSystem = 'You are a senior QA engineer. Return valid JSON only. English only. No markdown.';

  const makeTcUser = (count: number, focus: string) =>
`URL: ${pageData.url}
Title: ${pageData.title}
Goal: ${effectiveContext}
Focus: ${focus}

Elements (#=original DOM index):
${elementsStr}

Generate at least ${count} unique QA test cases covering ${focus}.

Rules:
- relevant_indices: original # indices of elements the test interacts with.
- expected_result: exact observable UI outcome.
- No duplicate scenarios. English only.

Return exactly:
{"test_cases":[{"number":1,"scenario":"","expected_result":"","relevant_indices":[0]}]}`;

  const safeMinTestCases = Math.max(1, Math.floor(minTestCases));
  const numBatches = Math.ceil(safeMinTestCases / TC_BATCH_SIZE);

  const runBatch = async (batchNum: number): Promise<{ testCases: any[]; tokens: number }> => {
    const usage = { totalTokens: 0 };
    const remaining = safeMinTestCases - batchNum * TC_BATCH_SIZE;
    const targetCount = Math.min(TC_BATCH_SIZE, remaining);
    const focus = getBatchFocus(batchNum);
    const tcUser = makeTcUser(targetCount, focus);

    let result = '';
    let lastErr: any = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        result = await callLLM(
          provider,
          model,
          apiKey,
          tcSystem,
          tcUser,
          true,
          TC_MAX_OUTPUT_TOKENS,
          usage,
          publicBaseUrl
        );
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`Test case batch ${batchNum + 1} attempt ${attempt} failed:`, err);
      }
    }

    if (!result) {
      throw new Error(`Test case batch ${batchNum + 1} failed: ${lastErr?.message || lastErr}`);
    }

    const parsed = parseJSONSafe<{ test_cases: any[] }>(result);
    return { testCases: parsed.test_cases || [], tokens: usage.totalTokens || 0 };
  };

  const batchResults = await Promise.all(
    Array.from({ length: numBatches }, (_, i) => runBatch(i))
  );

  const rawTestCases = batchResults.flatMap(r => r.testCases);
  const testCases = rawTestCases.map((tc, i) => normalizeTestCase(tc, i));
  const totalTokens = batchResults.reduce((sum, r) => sum + r.tokens, 0);

  if (!testCases.length) {
    throw new Error('AI returned empty test case list');
  }

  return { testCases, tokens: totalTokens };
}

function getTargetElementRefs(pageData: PageData, testCase: any): ElementRef[] {
  if (Array.isArray(testCase.relevant_indices) && testCase.relevant_indices.length > 0) {
    const indices = testCase.relevant_indices
      .map((idx: any) => Number(idx))
      .filter((idx: number) => Number.isInteger(idx) && idx >= 0 && idx < pageData.elements.length);

    if (indices.length > 0) {
      return Array.from(new Set<number>(indices)).map(originalIndex => ({
        originalIndex,
        el: pageData.elements[originalIndex],
      }));
    }
  }

  if (Array.isArray(testCase.relevant_selectors) && testCase.relevant_selectors.length > 0) {
    const selectors = testCase.relevant_selectors.map((s: string) => s.toLowerCase().trim());
    const refs = pageData.elements
      .map((el, originalIndex) => ({ el, originalIndex }))
      .filter(({ el }) => selectors.includes(el.css_selector?.toLowerCase().trim()));

    if (refs.length > 0) return refs;
  }

  // Fallback: send the full DOM only when AI did not provide usable indices.
  return pageData.elements.map((el, originalIndex) => ({ el, originalIndex }));
}

export async function generateScriptForTestCase(
  pageData: PageData,
  userContext: string,
  provider: string,
  model: string,
  apiKey: string,
  testCase: any,
  framework: string = 'playwright',
  language: string = 'typescript',
  publicBaseUrl: string = ''
): Promise<ScriptFile & { tokens_used: number }> {
  // ponytail: caller decides model (stage2Model); no forced downgrade here
  const frameworkRules = getFrameworkRules(framework, language);

  // Stage 2 sends only relevant elements with selectors.
  const targetElementRefs = getTargetElementRefs(pageData, testCase);
  const elementsStr = formatElementRefs(targetElementRefs, true);

  const steps = Array.isArray(testCase.test_steps)
    ? testCase.test_steps.join(' → ')
    : (testCase.input || '');
  const tcSummary = [
    `${testCase.number}. ${testCase.name || testCase.scenario}`,
    `pre-condition: ${testCase.pre_condition || ''}`,
    `steps: ${steps}`,
    `expected: ${testCase.expected_result}`,
    `file: ${testCase.file_name}`,
  ].join(' | ');

  const scrSystem = 'You are a senior QA automation engineer. Return valid JSON only. English code only. No markdown.';

  const scrUser =
`Create one ${framework.toUpperCase()} ${language.toUpperCase()} test script.

URL: ${pageData.url}
Goal: ${userContext}

Elements:
${elementsStr}

Test case:
${tcSummary}

Framework rules:
- ${frameworkRules}

Script rules:
- Navigate to URL first.
- Use provided selectors only.
- Prefer stable selectors: id > name > data-testid > placeholder > css.
- Use concrete input values from the test case.
- Assert visible UI result, text, error state, URL, or value where relevant.
- Do not test unrelated elements.
- Keep script 15-30 lines.
- No comments unless required.
- Escape newlines and quotes correctly inside JSON.

Return exactly:
{"file_name":"${testCase.file_name}","script_location":"${testCase.script_location}","content":"<script>"}`;

  const scrUsage = { totalTokens: 0 };
  let scrResult = '';
  let lastErr: any = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      scrResult = await callLLM(
        provider,
        model,
        apiKey,
        scrSystem,
        scrUser,
        true,
        SCRIPT_MAX_OUTPUT_TOKENS,
        scrUsage,
        publicBaseUrl
      );
      break;
    } catch (err) {
      lastErr = err;
      console.warn(`Script generation for test case ${testCase.number} attempt ${attempt} failed:`, err);
    }
  }

  if (!scrResult) {
    throw new Error(`Failed to generate script for test case ${testCase.number}: ${lastErr?.message || lastErr}`);
  }

  const scrParsed = parseJSONSafe<ScriptFile>(scrResult);

  return {
    ...scrParsed,
    file_name: testCase.file_name,
    script_location: testCase.script_location,
    tokens_used: scrUsage.totalTokens || 0,
  };
}

export async function analyzePage(
  pageData: PageData,
  userContext: string,
  provider: string,
  model: string,
  apiKey: string,
  customPrompt: string = '',
  framework: string = 'playwright',
  language: string = 'typescript'
): Promise<{ testCases: any[]; scripts: ScriptFile[]; tokens: number }> {
  const { testCases, tokens: tcTokens } = await generateTestCases(
    pageData,
    userContext,
    provider,
    model,
    apiKey,
    customPrompt
  );

  let totalTokens = tcTokens;
  const scripts: ScriptFile[] = [];

  // Sequential fallback for direct analyzePage calls.
  // If you already have an external queue/parallel runner, call generateScriptForTestCase there instead.
  for (const tc of testCases) {
    const scriptRes = await generateScriptForTestCase(
      pageData,
      userContext,
      provider,
      model,
      apiKey,
      tc,
      framework,
      language
    );

    scripts.push(scriptRes);
    totalTokens += scriptRes.tokens_used || 0;
  }

  return { testCases, scripts, tokens: totalTokens };
}

export type { PageData as PageDataType };
