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
  const f = (fw || '').toLowerCase().trim();
  const l = (lang || '').toLowerCase().trim();

  if (f === 'cypress') {
    return (l === 'javascript' || l === 'js') ? '.cy.js' : '.cy.ts';
  }

  if (f === 'selenium') {
    if (l === 'python' || l === 'py') return '.py';
    if (l === 'java') return '.java';
    if (l === 'csharp' || l === 'c#' || l === 'cs') return '.cs';
    return (l === 'javascript' || l === 'js') ? '.js' : '.ts';
  }

  // Playwright default
  if (l === 'python' || l === 'py') return '.py';
  if (l === 'javascript' || l === 'js') return '.spec.js';
  return '.spec.ts';
}

export function getFrameworkRules(fw: string, lang: string, usePom: boolean = false): string {
  const f = (fw || '').toLowerCase().trim();
  const l = (lang || '').toLowerCase().trim();
  const isTs = l === 'typescript' || l === 'ts';

  if (f === 'cypress') {
    const rules = [
      `Use Cypress with ${isTs ? 'TypeScript (.cy.ts)' : 'JavaScript (.cy.js)'}.`,
      `Structure tests using describe(...) and it(...) blocks, using cy.visit(...), cy.get(...), cy.contains(...), and should(...)/expect(...) assertions.`,
      isTs
        ? 'Use proper TypeScript syntax.'
        : 'Use pure JavaScript syntax (ES6+), NO TypeScript types, interfaces, or type annotations.',
      'Locator resilience hierarchy: [data-testid="..."] > accessible name/aria/label > button/link text content (cy.contains) > css selector.',
      'Locator Fallback: for resilient querying in Cypress, use multi-selector fallback in cy.get() (e.g. cy.get(\'[data-testid="submit-btn"], button[type="submit"]\').first()) or cy.contains().',
    ];
    if (usePom) {
      rules.push(
        `Page Object Model (POM): Define a dedicated Page Object class (e.g. class PageName) encapsulating element locators and user action methods, instantiate it, and execute interactions through the POM class.`
      );
    }
    return rules.join('\n- ');
  }

  if (f === 'selenium') {
    const rules = [
      `Use Selenium WebDriver with ${lang.toUpperCase()}.`,
      'Initialize WebDriver, open the URL, interact with elements, assert results, and ensure driver.quit().',
      `Include required Selenium imports for ${lang.toUpperCase()}.`,
      'Locator resilience hierarchy: By.css("[data-testid=...]") > By.id > By.name > By.xpath/By.css.',
    ];
    if (usePom) {
      rules.push('Page Object Model (POM): Encapsulate page elements and actions in a Page Object class.');
    }
    return rules.join('\n- ');
  }

  // Playwright default
  const rules = [
    `Use Playwright test runner with ${isTs ? 'TypeScript (.spec.ts)' : 'JavaScript (.spec.js)'}.`,
    `Import from '@playwright/test': import { test, expect } from '@playwright/test';`,
    isTs
      ? 'Use valid TypeScript syntax (e.g., async ({ page }) => { ... }).'
      : 'Use pure JavaScript syntax only, NO TypeScript type annotations (no : Page, : string, interface, etc.).',
    'Locator resilience hierarchy: page.getByTestId(...) > page.getByRole(...) / page.getByLabel(...) > page.getByPlaceholder(...) / page.getByText(...) > page.locator(...).',
    'Locator Fallback with .or(): use Playwright\'s locator fallback chaining .or() where selectors may vary (e.g., page.getByTestId("submit-btn").or(page.getByRole("button", { name: /submit/i })).or(page.locator("button[type=\\"submit\\"]"))).',
    'Always await asynchronous actions and assertions: await page.goto(...), await page.waitForLoadState("domcontentloaded"), await expect(...).toBeVisible().',
  ];
  if (usePom) {
    rules.push(
      `Page Object Model (POM): Define a dedicated Page Object class (e.g. class ViewPage) containing element locators and action methods, instantiate it in test(), and run steps via the POM instance.`
    );
  }
  return rules.join('\n- ');
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
  if (!pageData?.elements || !Array.isArray(pageData.elements)) {
    return [];
  }

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
  publicBaseUrl: string = '',
  usePom: boolean = false
): Promise<ScriptFile & { tokens_used: number; pom_code?: string }> {
  const fw = (framework || 'playwright').toLowerCase().trim();
  const lang = (language || 'typescript').toLowerCase().trim();
  const ext = getFileExtension(fw, lang);
  const defaultFolder = fw === 'cypress' ? 'cypress/e2e' : 'tests';

  // Compute canonical file name and script location
  let fileName = testCase.file_name || '';
  if (!fileName) {
    const slug = (testCase.name || testCase.scenario || `test-${testCase.number || 1}`)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 40);
    fileName = `test-${testCase.number || 1}-${slug}${ext}`;
  } else {
    fileName = fileName.replace(/\.(spec|cy|test)\.(ts|js)$/i, '').replace(/\.(ts|js|py|cs|java)$/i, '') + ext;
  }

  let scriptLocation = testCase.script_location || '';
  if (!scriptLocation) {
    scriptLocation = `${defaultFolder}/${fileName}`;
  } else {
    const dir = scriptLocation.includes('/') ? scriptLocation.slice(0, scriptLocation.lastIndexOf('/')) : defaultFolder;
    scriptLocation = `${dir}/${fileName}`;
  }

  // ponytail: caller decides model (stage2Model); no forced downgrade here
  const frameworkRules = getFrameworkRules(fw, lang, usePom);

  // Stage 2 sends only relevant elements with selectors.
  const targetElementRefs = getTargetElementRefs(pageData, testCase);
  const elementsStr = formatElementRefs(targetElementRefs, true);

  const steps = Array.isArray(testCase.test_steps)
    ? testCase.test_steps.join(' → ')
    : (testCase.input || '');
  const tcSummary = [
    `${testCase.number}. ${testCase.name || testCase.scenario}`,
    `pre-condition: ${testCase.pre_condition || 'None'}`,
    `steps: ${steps}`,
    `expected: ${testCase.expected_result}`,
    `file: ${fileName}`,
  ].join(' | ');

  const scrSystem = 'You are a senior QA automation engineer. Return valid JSON only. English code only. No markdown.';

  const pomInstruction = usePom
    ? `Page Object Model (POM) requirement:
- Define a reusable Page Object class representing this page/view.
- Encapsulate locators (using the resilient locator hierarchy) as properties or getters.
- Encapsulate user interaction methods (e.g. fillForm, submit, verify).
- In the test block, instantiate the Page Object and execute the test steps using POM methods.
- The generated code must be completely self-contained and ready to execute.`
    : `Direct script requirement:
- Write a clean, self-contained test script executing the test steps directly.`;

  const scrUser =
`Create one ${fw.toUpperCase()} (${lang.toUpperCase()}) test script.

Target URL: ${pageData?.url || ''}
Context: ${userContext || ''}

Available DOM Elements:
${elementsStr || 'No specific DOM elements captured. Infer robust accessible locators from scenario steps.'}

Test Case Details:
${tcSummary}

Framework Rules:
- ${frameworkRules}

Locator & Resilience Rules:
- Prioritize resilient locators in this strict order: data-testid > accessible role/label > placeholder/text > css selector.
- Use resilient fallback mechanisms:
  * In Playwright: chain .or() for alternative locators (e.g., page.getByTestId('submit').or(page.getByRole('button', { name: /submit/i }))).
  * In Cypress: use multi-selector fallback in cy.get() (e.g., cy.get('[data-testid="submit"], button[type="submit"]')).
- Navigate to URL first.
- Use concrete input values from the test case.
- Assert visible UI result, text, error state, URL, or value where relevant.
- Do not test unrelated elements.
- Keep script concise, clean, and production-ready without unnecessary comments.
- Escape newlines and quotes correctly inside JSON.

${pomInstruction}

Return exactly:
{"file_name":"${fileName}","script_location":"${scriptLocation}","content":"<script>"${usePom ? ',"pom_code":"<optional separate POM class definition>"' : ''}}`;

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

  const scrParsed = parseJSONSafe<ScriptFile & { pom_code?: string }>(scrResult);

  return {
    ...scrParsed,
    file_name: scrParsed.file_name || fileName,
    script_location: scrParsed.script_location || scriptLocation,
    tokens_used: scrUsage.totalTokens || 0,
    ...(scrParsed.pom_code ? { pom_code: scrParsed.pom_code } : {}),
  };
}

export async function generatePageObjectModel(
  pageData: PageData,
  userContext: string,
  provider: string,
  model: string,
  apiKey: string,
  framework: string = 'playwright',
  language: string = 'typescript',
  publicBaseUrl: string = ''
): Promise<ScriptFile & { tokens_used: number }> {
  const fw = (framework || 'playwright').toLowerCase().trim();
  const lang = (language || 'typescript').toLowerCase().trim();
  const isTs = lang === 'typescript' || lang === 'ts';
  const ext = isTs ? '.ts' : '.js';

  const slug = extractCaseSlug(userContext || pageData?.title || 'page');
  const className = slug.charAt(0).toUpperCase() + slug.slice(1) + 'Page';
  const fileName = `${className}${ext}`;
  const folder = fw === 'cypress' ? 'cypress/pages' : 'pages';
  const scriptLocation = `${folder}/${fileName}`;

  const elementsStr = formatElements(pageData?.elements || [], true);
  const frameworkRules = getFrameworkRules(fw, lang, true);

  const systemPrompt = 'You are a senior QA automation architect. Return valid JSON only. English code only. No markdown.';
  const userPrompt =
`Generate a comprehensive Page Object Model (POM) class for this web application.

Target URL: ${pageData?.url || ''}
Page Title: ${pageData?.title || ''}
Context: ${userContext || ''}

Available DOM Elements:
${elementsStr || 'None captured. Infer standard accessible locators.'}

Framework Rules:
- ${frameworkRules}

POM Requirements:
- Class name: ${className}
- Define locators for key interactive elements using the resilient hierarchy (data-testid > accessible role/label > text > css).
- Implement reusable interaction methods for common user flows (filling forms, submitting, navigating, asserting state).
${fw === 'cypress'
  ? `- Cypress style: define getters returning cy.get(...) or cy.contains(...) and action methods.`
  : `- Playwright style: initialize locators with Page in constructor (${isTs ? 'using typed properties readonly page: Page' : 'constructor(page)'}).`}
- Export the class: export class ${className} { ... }

Return exactly valid JSON:
{"file_name":"${fileName}","script_location":"${scriptLocation}","content":"<POM class code>"}`;

  const usage = { totalTokens: 0 };
  const rawResult = await callLLM(
    provider,
    model,
    apiKey,
    systemPrompt,
    userPrompt,
    true,
    SCRIPT_MAX_OUTPUT_TOKENS,
    usage,
    publicBaseUrl
  );

  const parsed = parseJSONSafe<ScriptFile>(rawResult);
  return {
    file_name: parsed.file_name || fileName,
    script_location: parsed.script_location || scriptLocation,
    content: parsed.content || '',
    tokens_used: usage.totalTokens || 0,
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
  language: string = 'typescript',
  usePom: boolean = false
): Promise<{ testCases: any[]; scripts: ScriptFile[]; tokens: number; pom?: ScriptFile }> {
  const { testCases, tokens: tcTokens } = await generateTestCases(
    pageData,
    userContext,
    provider,
    model,
    apiKey,
    customPrompt
  );

  let totalTokens = tcTokens;
  let pomFile: ScriptFile | undefined;

  if (usePom) {
    try {
      const pomRes = await generatePageObjectModel(
        pageData,
        userContext,
        provider,
        model,
        apiKey,
        framework,
        language
      );
      pomFile = pomRes;
      totalTokens += pomRes.tokens_used || 0;
    } catch (e) {
      console.warn('Failed to generate shared POM class in analyzePage:', e);
    }
  }

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
      language,
      '',
      usePom
    );

    scripts.push(scriptRes);
    totalTokens += scriptRes.tokens_used || 0;
  }

  return { testCases, scripts, tokens: totalTokens, pom: pomFile };
}

export type { PageData as PageDataType };
