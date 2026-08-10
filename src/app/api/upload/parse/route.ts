import { NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { auth } from '@/auth';

export async function POST(request: Request) {
  try {
    if (!(await auth())?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ detail: 'No file provided' }, { status: 400 });
    }

    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ detail: 'PDF file size must be less than 15MB' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();

    return NextResponse.json({
      success: true,
      filename: file.name,
      text: textResult.text || '',
      pages: textResult.total || 1,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to parse PDF' }, { status: 500 });
  }
}
