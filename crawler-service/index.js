const express = require('express');
const { chromium } = require('playwright');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));

const SECRET = process.env.CRAWLER_SECRET;
if (!SECRET) {
  console.error('CRAWLER_SECRET is required');
  process.exit(1);
}
const MAX_CONCURRENT = 2;
let activeCount = 0;

function authMiddleware(req, res, next) {
  const token = req.headers['x-crawler-secret'];
  const supplied = Buffer.from(typeof token === 'string' ? token : '');
  const expected = Buffer.from(SECRET);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}


function isPrivateIp(address) {  const ip = address.toLowerCase().split('%')[0];
  if (require('net').isIP(ip) === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224;
  }
  return ip === '::' || ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') ||
    /^fe[89ab]/.test(ip) || ip.startsWith('2001:db8:') || ip.startsWith('100::');
}

async function validateUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Invalid URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid URL');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('Destination not allowed');
  const addresses = require('net').isIP(host) ? [{ address: host }] : await require('dns').promises.lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) throw new Error('Destination not allowed');
  return url.toString();
}

app.get('/health', (_, res) => res.json({ ok: true, active: activeCount, max: MAX_CONCURRENT }));

app.post('/screenshot', authMiddleware, async (req, res) => {
  const { url, auth } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try { await validateUrl(url); if (auth?.login_url) await validateUrl(auth.login_url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  if (activeCount >= MAX_CONCURRENT) {
    return res.status(429).json({ queued: true, active: activeCount, max: MAX_CONCURRENT });
  }
  activeCount++;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

    if (auth?.auth_type === 'basic' && auth.username) {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      await context.setExtraHTTPHeaders({ Authorization: `Basic ${encoded}` });
    }
    if (auth?.auth_type === 'bearer' && auth.token) {
      await context.setExtraHTTPHeaders({ Authorization: `Bearer ${auth.token}` });
    }
    if (auth?.auth_type === 'cookie' && auth.cookies) {
      const parsed = new URL(url);
      await context.addCookies(Object.entries(auth.cookies).map(([name, value]) => ({
        name, value: String(value), domain: parsed.hostname, path: '/',
      })));
    }

    const page = await context.newPage();
    if (auth?.auth_type === 'form' && auth.login_url && auth.form_fields) {
      await page.goto(auth.login_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      for (const [selector, value] of Object.entries(auth.form_fields)) {
        await page.fill(selector, String(value)).catch(() => {});
      }
      await Promise.all([page.waitForNavigation({ timeout: 15000 }).catch(() => {}), page.keyboard.press('Enter')]);
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    const title = await page.title();
    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    await browser.close();
    browser = null;

    res.json({ title, screenshot: screenshot.toString('base64'), url });
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Crawler request failed' });
  } finally {
    activeCount--;
  }
});

app.post('/crawl', authMiddleware, async (req, res) => {
  const { url, auth } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try { await validateUrl(url); if (auth?.login_url) await validateUrl(auth.login_url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  if (activeCount >= MAX_CONCURRENT) {
    return res.status(429).json({ queued: true, active: activeCount, max: MAX_CONCURRENT });
  }

  activeCount++;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const contextOptions = {};

    // Basic auth via HTTP header
    if (auth?.auth_type === 'basic' && auth.username && auth.password) {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      contextOptions.extraHTTPHeaders = { Authorization: `Basic ${encoded}` };
    }

    // Bearer token
    if (auth?.auth_type === 'bearer' && auth.token) {
      contextOptions.extraHTTPHeaders = { Authorization: `Bearer ${auth.token}` };
    }

    const context = await browser.newContext(contextOptions);

    // Cookie auth
    if (auth?.auth_type === 'cookie' && auth.cookies) {
      const parsed = new URL(url);
      const cookieList = Object.entries(auth.cookies).map(([name, value]) => ({
        name, value: String(value),
        domain: parsed.hostname,
        path: '/',
      }));
      await context.addCookies(cookieList);
    }

    const page = await context.newPage();

    // Form login: navigate to login page, fill and submit, then go to target URL
    if (auth?.auth_type === 'form' && auth.login_url && auth.form_fields) {
      await page.goto(auth.login_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      for (const [selector, value] of Object.entries(auth.form_fields)) {
        await page.fill(selector, String(value)).catch(() => {});
      }
      await Promise.all([
        page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
        page.keyboard.press('Enter'),
      ]);
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait a bit for any lazy-loaded content
    await page.waitForTimeout(1000);

    const title = await page.title();

    // Extract ONLY visible interactive elements using real browser visibility
    const elements = await page.evaluate(() => {
      const SELECTORS = [
        'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
        '[role="tab"]', '[role="menuitem"]', '[onclick]',
      ];

      function isVisible(el) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 0 &&
          rect.height > 0 &&
          !el.hasAttribute('hidden') &&
          el.getAttribute('aria-hidden') !== 'true'
        );
      }

      const seen = new Set();
      const results = [];

      for (const selector of SELECTORS) {
        for (const el of document.querySelectorAll(selector)) {
          if (!isVisible(el)) continue;
          // deduplicate by text+tag+type
          const key = `${el.tagName}|${el.getAttribute('type')}|${el.textContent?.trim().slice(0, 50)}|${el.getAttribute('href')}`;
          if (seen.has(key)) continue;
          seen.add(key);

          results.push({
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute('type') || '',
            text: el.textContent?.trim().substring(0, 120) || '',
            placeholder: el.getAttribute('placeholder') || '',
            name: el.getAttribute('name') || '',
            id: el.getAttribute('id') || '',
            href: el.getAttribute('href') || '',
            'aria-label': el.getAttribute('aria-label') || '',
            role: el.getAttribute('role') || '',
            class: el.className?.toString().substring(0, 60) || '',
          });
        }
      }
      return results;
    });

    await browser.close();
    browser = null;

    res.json({ title, elements, url, source: 'playwright' });
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Crawler request failed' });
  } finally {
    activeCount--;
  }
});

app.post('/run-test', authMiddleware, async (req, res) => {
  const { script_content, file_name } = req.body;
  if (!script_content) return res.status(400).json({ error: 'script_content required' });
  if (activeCount >= MAX_CONCURRENT) {
    return res.status(429).json({ queued: true, active: activeCount, max: MAX_CONCURRENT });
  }
  activeCount++;

  // ponytail: Defense-in-depth for free-tier hosting (Railway/Vercel) where microVMs are unavailable.
  // We sanitize the environment (stripping CRAWLER_SECRET/DATABASE_URL) and enforce a strict timeout.
  // True enterprise sandboxing requires a separate microVM or container runtime.
  
  // Static analysis: reject obvious malicious payloads
  const blocklist = /fs\.read|child_process|exec|eval\(|process\.env/i;
  if (blocklist.test(script_content)) {
    activeCount--;
    return res.status(403).json({ error: 'Script contains forbidden operations (fs/exec/env)' });
  }

  const runId = crypto.randomBytes(8).toString('hex');
  // Ensure strict isolation of the working directory
  const tmpDir = path.resolve(path.join(process.cwd(), 'tmp-tests', runId));
  if (!tmpDir.startsWith(path.join(process.cwd(), 'tmp-tests'))) {
    activeCount--;
    return res.status(400).json({ error: 'Invalid path' });
  }

  const safeFileName = (file_name || 'test.spec.ts').replace(/[^a-zA-Z0-9._-]/g, '_');
  const scriptPath = path.join(tmpDir, safeFileName);

  try {
    // Create with restrictive permissions
    fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(scriptPath, script_content, { encoding: 'utf8', mode: 0o600 });

    const stdout = await new Promise((resolve, reject) => {
      // Sterile environment
      const cleanEnv = {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
      };

      execFile('npx', ['playwright', 'test', scriptPath, '--reporter=json'],
        { 
          cwd: tmpDir, // Restrict execution to the temp directory
          timeout: 55000, 
          maxBuffer: 4 * 1024 * 1024,
          env: cleanEnv // No secrets
        },
        (err, out) => resolve(out || ''));  // playwright exits non-zero on failures; we parse output
    });

    let report = {};
    try { report = JSON.parse(stdout); } catch { /* no-op */ }

    const stats = report.stats || {};
    const firstErr = report.suites?.[0]?.specs?.[0]?.tests?.[0]?.results?.[0]?.error?.message || null;
    res.json({
      passed:   stats.expected ?? 0,
      failed:   stats.unexpected ?? 0,
      duration: Math.round((stats.duration || 0) / 1000),
      error:    firstErr,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Crawler request failed' });
  } finally {
    activeCount--;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Crawler service on :${PORT}`));

