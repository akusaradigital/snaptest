import axios, { AxiosRequestConfig } from 'axios';
import { validatedAxiosRequest, validateOutboundUrl } from '@/lib/outbound-url';
import { attr, closest, hasAttr, HtmlElement, HtmlRoot, parseHTML, selectAll, selectOne, tagName, text } from './html';

export interface DOMElement {
  tag: string;
  id: string | null;
  name: string | null;
  type: string | null;
  placeholder: string | null;
  aria_label: string | null;
  label_text: string | null;
  text_content: string | null;
  css_selector: string;
}

export interface PageData {
  title: string;
  url: string;
  elements: DOMElement[];
}

export interface AuthConfig {
  auth_type?: string;
  username?: string;
  password?: string;
  token?: string;
  cookies?: Record<string, string>;
  login_url?: string;
  form_fields?: Record<string, string>;
}

const SOCIAL_RE = /facebook\.com|twitter\.com|x\.com|linkedin\.com|instagram\.com|youtube\.com|pinterest\.com|github\.com|tiktok\.com/i;

function buildCssSelector(tag: string, el: HtmlElement): string {
  const id = attr(el, 'id');
  const name = attr(el, 'name');
  const testid = attr(el, 'data-testid');
  const placeholder = attr(el, 'placeholder');
  const type = attr(el, 'type');
  if (id) return `#${id}`;
  if (name) return `${tag}[name='${name}']`;
  if (testid) return `[data-testid='${testid}']`;
  if (placeholder) return `${tag}[placeholder='${placeholder}']`;
  if (type && tag === 'input') return `input[type='${type}']`;
  return tag;
}

function extractElements(root: HtmlRoot): DOMElement[] {
  const results: DOMElement[] = [];
  const seenKeys = new Set<string>();

  for (const el of selectAll(root, 'input, button, select, textarea, a[href], [role="button"], [type="submit"]')) {
    // ponytail: skip explicitly hidden elements (can't compute styles without a browser)
    const style = attr(el, 'style') || '';
    if (/display\s*:\s*none|visibility\s*:\s*hidden/.test(style)) continue;
    if (hasAttr(el, 'hidden')) continue;

    const tag = tagName(el);

    // skip social links
    if (tag === 'a') {
      const href = attr(el, 'href') || '';
      if (SOCIAL_RE.test(href)) continue;
    }

    // label lookup
    let labelText = '';
    const id = attr(el, 'id') || null;
    if (id) {
      const labelEl = selectAll(root, 'label').find((label) => attr(label, 'for') === id);
      if (labelEl) labelText = text(labelEl);
    }
    if (!labelText) {
      const parentLabel = closest(el, 'label');
      if (parentLabel) labelText = text(parentLabel);
    }

    const textContent = text(el).substring(0, 40);
    const name = attr(el, 'name') || null;
    const type = attr(el, 'type') || null;
    const placeholder = attr(el, 'placeholder') || null;
    const aria_label = attr(el, 'aria-label') || null;
    const testid = attr(el, 'data-testid') || null;
    const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';

    // filter anonymous/unidentifiable elements
    if (!id && !name && !testid && !placeholder && !aria_label && !labelText && !textContent && !isInput) continue;

    const cssSelector = buildCssSelector(tag, el);

    const dupKey = `${cssSelector}::${textContent}`;
    if (seenKeys.has(dupKey)) continue;
    seenKeys.add(dupKey);

    results.push({
      tag,
      id,
      name,
      type,
      placeholder,
      aria_label,
      label_text: labelText || null,
      text_content: textContent || null,
      css_selector: cssSelector,
    });
  }

  return results;
}

// Map Playwright service response element to DOMElement
function normalizePlElement(el: any): DOMElement {
  const tag = el.tag || 'a';
  const id = el.id || null;
  const name = el.name || null;
  const type = el.type || null;
  const placeholder = el.placeholder || null;
  const aria_label = el['aria-label'] || null;

  let css_selector = tag;
  if (id) css_selector = `#${id}`;
  else if (name) css_selector = `${tag}[name='${name}']`;
  else if (placeholder) css_selector = `${tag}[placeholder='${placeholder}']`;
  else if (type && tag === 'input') css_selector = `input[type='${type}']`;

  return {
    tag,
    id,
    name,
    type,
    placeholder,
    aria_label,
    label_text: null,
    text_content: (el.text || '').substring(0, 40) || null,
    css_selector,
  };
}

async function crawlPageWithService(targetURL: string, auth: AuthConfig | undefined, serviceUrl: string): Promise<PageData> {
  const secret = process.env.CRAWLER_SECRET || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['x-crawler-secret'] = secret;

  const res = await axios.post(`${serviceUrl}/crawl`, { url: targetURL, auth }, {
    headers,
    timeout: 60000,
    validateStatus: () => true,
  });
  if (res.status === 429 && res.data?.queued) {
    const err: any = new Error('Crawler at capacity');
    err.code = 'CRAWLER_QUEUED';
    err.active = res.data.active;
    err.max = res.data.max;
    throw err;
  }
  if (res.status >= 400) throw new Error(res.data?.error || `Crawler error ${res.status}`);
  const data = res.data;

  const elements: DOMElement[] = (data.elements || []).map(normalizePlElement);
  return { title: data.title || 'Untitled Page', url: targetURL, elements };
}

export async function screenshotPage(targetURL: string, auth: AuthConfig | undefined, serviceUrl: string): Promise<{ title: string; screenshot: string }> {
  const secret = process.env.CRAWLER_SECRET || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['x-crawler-secret'] = secret;

  const res = await axios.post(`${serviceUrl}/screenshot`, { url: targetURL, auth }, {
    headers,
    timeout: 60000,
    validateStatus: () => true,
  });
  if (res.status === 429 && res.data?.queued) {
    const err: any = new Error('Crawler at capacity');
    err.code = 'CRAWLER_QUEUED';
    err.active = res.data.active;
    err.max = res.data.max;
    throw err;
  }
  if (res.status >= 400) throw new Error(res.data?.error || `Screenshot error ${res.status}`);
  return { title: res.data.title || 'Untitled', screenshot: res.data.screenshot };
}

export async function crawlPage(targetURL: string, auth?: AuthConfig, mode?: 'static' | 'playwright'): Promise<PageData> {
  await validateOutboundUrl(targetURL);
  if (auth?.login_url) await validateOutboundUrl(auth.login_url);
  const serviceUrl = process.env.CRAWLER_URL?.replace(/\/$/, '');
  if (serviceUrl && mode !== 'static') {
    console.log('Crawling via Playwright service:', targetURL);
    return crawlPageWithService(targetURL, auth, serviceUrl);
  }
  if (mode === 'playwright' && !serviceUrl) {
    console.warn('Playwright mode requested but CRAWLER_URL not configured, falling back to static');
  }

  console.log('Crawling URL (cheerio):', targetURL);

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
  const config: AxiosRequestConfig = { headers, timeout: 30000, maxRedirects: 5 };

  if (auth?.auth_type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }

  if (auth?.auth_type === 'cookie' && auth.cookies) {
    headers['Cookie'] = Object.entries(auth.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  // ponytail: basic auth via axios config
  if (auth?.auth_type === 'basic' && auth.username) {
    config.auth = { username: auth.username, password: auth.password || '' };
  }

  // form auth: POST to login URL, carry session cookies forward
  if (auth?.auth_type === 'form' && auth.login_url && auth.form_fields) {
    try {
      const params = new URLSearchParams(auth.form_fields).toString();
      const loginRes = await validatedAxiosRequest(auth.login_url, {
        method: 'POST', data: params,
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000,
      });
      const rawCookies: string | string[] | undefined = loginRes.headers['set-cookie'];
      if (rawCookies) {
        const list: string[] = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
        const cookieStr = list.map(c => c.split(';')[0]).join('; ');
        headers['Cookie'] = cookieStr;
      }
    } catch (err) {
      console.warn('Form auth failed:', err);
    }
  }

  const res = await validatedAxiosRequest(targetURL, { ...config, method: 'GET' });
  if (res.status >= 400) throw new Error(`Target returned HTTP ${res.status}`);
  const html = typeof res.data === 'string' ? res.data : String(res.data);

  const root = parseHTML(html);
  const title = text(selectOne(root, 'title') || []) || 'Untitled Page';
  const elements = extractElements(root);

  return { title, url: targetURL, elements };
}
