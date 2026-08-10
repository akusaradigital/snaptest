import { NextResponse } from 'next/server';
import axios from 'axios';
import { auth } from '@/auth';
import { validatedAxiosRequest } from '@/lib/outbound-url';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    if (!(await auth())?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    const { figma_url, figma_token } = await request.json();

    if (!figma_url || !figma_token) {
      return NextResponse.json({ detail: 'Figma URL and Personal Access Token are required' }, { status: 400 });
    }

    // Extract file_key from Figma URL (e.g. figma.com/file/KEY/... or figma.com/design/KEY/...)
    const match = figma_url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
    if (!match?.[1]) {
      return NextResponse.json({ detail: 'Invalid Figma URL format. Expected figma.com/file/... or figma.com/design/...' }, { status: 400 });
    }
    const fileKey = match[1];

    // Fetch file document tree to get top-level node ID
    const docRes = await axios.get(`https://api.figma.com/v1/files/${fileKey}?depth=1`, {
      headers: { 'X-Figma-Token': figma_token.trim() },
      timeout: 10000,
    });

    const rootNodeId = docRes.data.document?.children?.[0]?.id || '0:1';

    // Request rendered PNG image of the canvas
    const imgRes = await axios.get(`https://api.figma.com/v1/images/${fileKey}?ids=${rootNodeId}&format=png`, {
      headers: { 'X-Figma-Token': figma_token.trim() },
      timeout: 15000,
    });

    const imageUrl = imgRes.data.images?.[rootNodeId];
    if (!imageUrl) {
      return NextResponse.json({ detail: 'Could not render image from Figma file' }, { status: 400 });
    }

    // Fetch PNG bytes and convert to base64
    const pngRes = await validatedAxiosRequest<ArrayBuffer>(imageUrl, {
      method: 'GET', responseType: 'arraybuffer', timeout: 15000, maxContentLength: MAX_IMAGE_BYTES,
    });
    const contentType = String(pngRes.headers['content-type'] || '').split(';')[0].toLowerCase();
    const imageBytes = Buffer.from(pngRes.data);
    if (pngRes.status >= 400 || !['image/png', 'image/jpeg', 'image/webp'].includes(contentType) || imageBytes.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ detail: 'Invalid or oversized Figma image' }, { status: 400 });
    }
    const imageBase64 = imageBytes.toString('base64');

    return NextResponse.json({
      success: true,
      title: docRes.data.name || 'Figma Design',
      image_base64: imageBase64,
    });
  } catch (err) {
    console.error('Figma fetch failed:', err);
    return NextResponse.json({ detail: 'Failed to fetch Figma file' }, { status: 500 });
  }
}
