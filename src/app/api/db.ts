import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import crypto from 'crypto';

// Neon SQL client - DATABASE_URL must be set in Vercel environment variables
// Format: postgresql://user:password@host/dbname?sslmode=require

let sql: NeonQueryFunction<false, false> | null = null;

function getSQL(): NeonQueryFunction<false, false> {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set');
    sql = neon(url);
  }
  return sql;
}

export async function initDB() {
  const db = getSQL();
  await db`
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      user_context TEXT NOT NULL,
      page_title TEXT DEFAULT '',
      elements_found INTEGER DEFAULT 0,
      ai_provider TEXT DEFAULT '',
      ai_model TEXT DEFAULT '',
      test_case_table TEXT DEFAULT '',
      test_cases_json TEXT DEFAULT '[]',
      scripts_json TEXT DEFAULT '[]',
      scripts_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS monitored_urls (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      last_checked TEXT,
      selectors_json TEXT DEFAULT '[]',
      selectors_total INTEGER DEFAULT 0,
      selectors_broken INTEGER DEFAULT 0,
      status TEXT DEFAULT 'healthy',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS monitor_snapshots (
      id TEXT PRIMARY KEY,
      monitor_id TEXT NOT NULL REFERENCES monitored_urls(id) ON DELETE CASCADE,
      selectors_json TEXT DEFAULT '[]',
      selectors_total INTEGER DEFAULT 0,
      selectors_broken INTEGER DEFAULT 0,
      status TEXT DEFAULT 'healthy',
      checked_at TEXT NOT NULL
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS idx_history_url ON history(url)`;
  await db`CREATE INDEX IF NOT EXISTS idx_monitor_snapshots_monitor_id ON monitor_snapshots(monitor_id)`;
}

// ponytail: initDB() isn't auto-called (tables created externally), so add a
// cheap idempotent migration that runs once per warm instance.
let migrated = false;
export async function ensureSchema() {
  if (migrated) return;
  const db = getSQL();
  await db`ALTER TABLE history ADD COLUMN IF NOT EXISTS user_id TEXT`;
  await db`ALTER TABLE history ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false`;
  await db`ALTER TABLE monitored_urls ADD COLUMN IF NOT EXISTS user_id TEXT`;
  // monitors are per-user: a URL can be watched by many users
  await db`ALTER TABLE monitored_urls DROP CONSTRAINT IF EXISTS monitored_urls_url_key`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS monitored_urls_user_url_key ON monitored_urls(user_id, url)`;
  await db`CREATE INDEX IF NOT EXISTS idx_history_user_id ON history(user_id)`;
  // team workspace tables
  await db`CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`;
  await db`CREATE TABLE IF NOT EXISTS team_members (
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL,
    PRIMARY KEY(team_id, user_id)
  )`;
  await db`ALTER TABLE history ADD COLUMN IF NOT EXISTS team_id TEXT`;

  // Server-side Ticket sessions persistence
  await db`CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT DEFAULT '',
    messages_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`;
  await db`CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at DESC)`;

  // Usage & Prompt Caching log
  await db`CREATE TABLE IF NOT EXISTS usage_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source TEXT NOT NULL,
    provider TEXT DEFAULT '',
    model TEXT DEFAULT '',
    total_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_creation_tokens INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  )`;
  await db`CREATE INDEX IF NOT EXISTS idx_usage_log_user_id ON usage_log(user_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON usage_log(created_at DESC)`;

  // URL Crawl Caching Table (24h TTL enforced in app logic)
  await db`CREATE TABLE IF NOT EXISTS crawl_cache (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    crawl_result_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  )`;
  await db`CREATE INDEX IF NOT EXISTS idx_crawl_cache_url ON crawl_cache(url)`;
  await db`CREATE INDEX IF NOT EXISTS idx_crawl_cache_created_at ON crawl_cache(created_at)`;

  // Unified Multi-Agent Sessions Persistence
  await db`CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    title TEXT DEFAULT '',
    data_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`;
  await db`CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_agent ON agent_sessions(user_id, agent_type)`;
  await db`CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated ON agent_sessions(updated_at DESC)`;

  // Fire-and-forget: Auto Garbage Collection
  // We do it asynchronously without awaiting so it doesn't block the request.
  db`DELETE FROM crawl_cache WHERE created_at::timestamp < NOW() - INTERVAL '48 hours'`.catch(console.error);
  db`DELETE FROM usage_log WHERE created_at::timestamp < NOW() - INTERVAL '30 days'`.catch(console.error);

  migrated = true;
}

export function getDB() {
  return getSQL();
}

export async function logUsage(params: {
  user_id: string;
  source: 'test_generation' | 'ticket_agent' | 'data_generation' | 'api_agent' | 'script_repair' | 'coverage_check';
  provider?: string;
  model?: string;
  total_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
}) {
  if (!params.user_id) return;
  try {
    await ensureSchema();
    const db = getSQL();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db`
      INSERT INTO usage_log (
        id, user_id, source, provider, model, total_tokens, cache_read_tokens, cache_creation_tokens, created_at
      ) VALUES (
        ${id},
        ${params.user_id},
        ${params.source},
        ${params.provider || ''},
        ${params.model || ''},
        ${params.total_tokens || 0},
        ${params.cache_read_tokens || 0},
        ${params.cache_creation_tokens || 0},
        ${now}
      )
    `;
  } catch (err) {
    // Non-blocking: usage logging errors should never break main flow
    console.warn('[UsageLog] Failed to log usage:', err);
  }
}
