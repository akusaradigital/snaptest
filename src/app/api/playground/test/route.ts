import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validatedAxiosRequest } from '@/lib/outbound-url';
import { attr, parseHTML, selectAll, tagName, text } from '../../html';

export async function POST(request: Request) {
  try {
    if (!(await auth())?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    const { url, selector } = await request.json();
    if (!url || !selector) {
      return NextResponse.json({ detail: 'URL and Selector are required' }, { status: 400 });
    }

    const res = await validatedAxiosRequest(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 30000,
    });
    if (res.status >= 400) throw new Error('Target request failed');
    const html = typeof res.data === 'string' ? res.data : String(res.data);
    const root = parseHTML(html);

    const matched = selectAll(root, selector);
    const results: any[] = [];
    const limit = Math.min(matched.length, 20);

    for (const el of matched.slice(0, limit)) {
      results.push({
        tag: tagName(el),
        text: text(el).substring(0, 100),
        id: attr(el, 'id') || null,
      });
    }

    return NextResponse.json({
      selector,
      matchCount: matched.length,
      elements: results,
      isUnique: matched.length === 1,
    });
  } catch (err) {
    console.error('Playground selector test failed:', err);
    return NextResponse.json({ detail: 'Unable to test URL' }, { status: 500 });
  }
}
