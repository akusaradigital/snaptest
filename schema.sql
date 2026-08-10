-- Current OmniQA bootstrap schema. Runtime migrations in ensureSchema() remain
-- idempotent so existing deployments are upgraded safely.

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
  user_id TEXT,
  is_public BOOLEAN DEFAULT false,
  team_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitored_urls (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  user_id TEXT,
  last_checked TEXT,
  selectors_json TEXT DEFAULT '[]',
  selectors_total INTEGER DEFAULT 0,
  selectors_broken INTEGER DEFAULT 0,
  status TEXT DEFAULT 'healthy',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitor_snapshots (
  id TEXT PRIMARY KEY,
  monitor_id TEXT NOT NULL REFERENCES monitored_urls(id) ON DELETE CASCADE,
  selectors_json TEXT DEFAULT '[]',
  selectors_total INTEGER DEFAULT 0,
  selectors_broken INTEGER DEFAULT 0,
  status TEXT DEFAULT 'healthy',
  checked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL,
  PRIMARY KEY(team_id, user_id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT DEFAULT '',
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  provider TEXT DEFAULT '',
  model TEXT DEFAULT '',
  total_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crawl_cache (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  crawl_result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  title TEXT DEFAULT '',
  data_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_url ON history(url);
CREATE INDEX IF NOT EXISTS idx_history_user_id ON history(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS monitored_urls_user_url_key ON monitored_urls(user_id, url);
CREATE INDEX IF NOT EXISTS idx_monitor_snapshots_monitor_id ON monitor_snapshots(monitor_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_log_user_id ON usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_cache_url ON crawl_cache(url);
CREATE INDEX IF NOT EXISTS idx_crawl_cache_created_at ON crawl_cache(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_agent ON agent_sessions(user_id, agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated ON agent_sessions(updated_at DESC);
