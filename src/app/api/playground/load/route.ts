import { NextResponse } from 'next/server';
import { crawlPage } from '../../crawler';
import { auth } from '@/auth';

export async function POST(request: Request) {
  try {
    if (!(await auth())?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    const { url } = await request.json();
    if (!url) {
      return NextResponse.json({ detail: 'URL is required' }, { status: 400 });
    }

    const pageData = await crawlPage(url);

    return NextResponse.json({
      title: pageData.title,
      url: pageData.url,
      elements_count: pageData.elements.length,
      elements: pageData.elements
    });
  } catch (err) {
    console.error('Playground load failed:', err);
    return NextResponse.json({ detail: 'Unable to load URL' }, { status: 500 });
  }
}
