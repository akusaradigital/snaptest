import { createHash, randomBytes, randomUUID } from 'crypto';
import { ensureSchema, getDB } from '@/app/api/db';

export function generateApiKey(): { rawKey: string; prefix: string } {
  const rawKey = `snaptest_${randomBytes(32).toString('base64url')}`;
  return { rawKey, prefix: rawKey.slice(0, 16) };
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(String(rawKey ?? '')).digest('hex');
}

export async function createApiKey(userId: string, name: string) {
  if (!userId || !name?.trim()) throw new Error('userId and name are required');
  await ensureSchema();
  const db = getDB();
  const { rawKey, prefix } = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const id = randomUUID();
  const now = new Date().toISOString();

  await db`
    INSERT INTO api_keys (
      id, user_id, name, key_hash, key_prefix, created_at
    ) VALUES (
      ${id}, ${userId}, ${name.trim()}, ${keyHash}, ${prefix}, ${now}
    )
  `;

  return { id, name: name.trim(), rawKey, prefix, createdAt: now };
}

export async function listApiKeys(userId: string) {
  if (!userId) return [];
  await ensureSchema();
  const db = getDB();
  const rows = await db`
    SELECT id, name, key_prefix as prefix, created_at as "createdAt", last_used_at as "lastUsedAt"
    FROM api_keys
    WHERE user_id = ${userId} AND revoked_at IS NULL
    ORDER BY created_at DESC
  `;
  return rows;
}

export async function revokeApiKey(userId: string, id: string) {
  if (!userId || !id) return false;
  await ensureSchema();
  const db = getDB();
  const now = new Date().toISOString();
  const result = await db`
    UPDATE api_keys
    SET revoked_at = ${now}
    WHERE id = ${id} AND user_id = ${userId} AND revoked_at IS NULL
    RETURNING id
  `;
  return result.length > 0;
}

export async function resolveApiKey(rawKey: string): Promise<{ userId: string } | null> {
  if (!rawKey || !rawKey.startsWith('snaptest_')) return null;
  await ensureSchema();
  const db = getDB();
  const keyHash = hashApiKey(rawKey);
  const rows = await db`
    SELECT id, user_id
    FROM api_keys
    WHERE key_hash = ${keyHash} AND revoked_at IS NULL
    LIMIT 1
  `;
  if (!rows || rows.length === 0) return null;

  const now = new Date().toISOString();
  // Fire-and-forget last_used_at update
  db`UPDATE api_keys SET last_used_at = ${now} WHERE id = ${rows[0].id}`.catch(() => {});

  return { userId: rows[0].user_id };
}
