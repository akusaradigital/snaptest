import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createApiKey, listApiKeys, revokeApiKey } from '@/lib/apiKeys';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.email;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const keys = await listApiKeys(userId);
    return NextResponse.json({ keys });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to list API keys' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.email;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const name = body?.name || 'Default API Key';
    const key = await createApiKey(userId, name);
    return NextResponse.json({ key }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create API key' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  const userId = session?.user?.email;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'API key ID is required' }, { status: 400 });

    const ok = await revokeApiKey(userId, id);
    if (!ok) return NextResponse.json({ error: 'Key not found or already revoked' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to revoke API key' }, { status: 500 });
  }
}
