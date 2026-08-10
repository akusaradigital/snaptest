# SnapTest - Agent Notes & Architecture Guide

Next.js 14 Web Application for AI-powered UI Test Generation, Automation Scripts, Jira Issue Management, Multi-Agent QA Orchestration, and Selector Health Monitoring.

## Current Tech Stack & Routing Architecture
- **Framework**: Next.js 14 App Router. Route groups under `(dashboard)/` share a single `DashboardShell` layout; middleware + `auth()` gate every protected route.
- **DB**: Neon PostgreSQL via `src/app/api/db.ts` and `DATABASE_URL`. Schema bootstrap is idempotent (`ensureSchema()` runs once per warm instance).
- **Auth**: Auth.js v5 (`src/auth.ts`) — Google OAuth, JWT sessions (7-day expiry). `middleware.ts` protects all non-public routes; `src/lib/authPolicy.mjs` lists public paths.
- **State & Keys**: All AI API keys stored in client-side `localStorage` only (ZERO server-side key storage). Keys are forwarded per request to the chosen provider.
- **9Router Integration**: Supports local `http://localhost:20128/v1` and public tunnels (`9router_public` stored in browser).
- **Layout & Design**: Tailwind CSS, lucide-react, unified chat interface across Test Case Agent & Issue Agent.

## Core Route Structure (10 sidebar pages + landing + share)
- `/` — Public marketing landing page (`src/app/page.tsx`) with feature highlights, provider list, and FAQ. CTA routes to `/dashboard` when signed in, else `/login`.
- `/login` — Google SSO sign-in with callback URL support.
- `/dashboard` — Dashboard overview with metrics (Total Tests, Active Monitors, Team Members) & Quick Actions.
- `/squad` — **QA Squad Orchestrator**: Multi-agent chat that plans & executes a single high-level command across specialized sub-agents (test_cases, test_data, api_test, test_planner, script_repair, coverage_check).
- `/generate` — **Test Case Agent**: Split-view UI (Chat Feed + Input Dock on left; File Workspace with `.xlsx`, `.spec.ts`, `.feature` tabs on right).
- `/planner` — **Test Planner**: Paste a PRD / User Story / Gherkin, get a structured test matrix (category, scenario, expected, priority, effort hours) exportable to CSV/XLSX.
- `/ticket` — **Issue & Ticket Agent**: AI Jira Ticket Agent chat thread & auto-detection of Bug/Feature/Improvement.
- `/api-agent` — **API Test Agent**: Paste cURL / OpenAPI / Postman spec, generate API test suites + Postman collections; supports multi-path OpenAPI and native file upload.
- `/data` — **Test Data Generator**: Describe fields or paste JSON schema, generate mock / boundary / negative payloads exportable as JSON/CSV.
- `/report` — **Executive Report**: One-click professional QA summary report (key achievements, risk assessment, recommendations) from last 30 days of activity, tickets, and AI usage; printable to PDF.
- `/history` — Searchable log of past test generations and saved ticket sessions.
- `/settings` — AI Provider configuration, Jira PAT integration, custom prompt templates, team settings.
- `/share/[id]` — Public read-only view of a shared result.
- `not-found.tsx` — Custom 404 page with animated Tailwind mascot and direct action link to `/dashboard`.

## Key Performance & Token Optimization Features
1. **URL Crawl Caching (`crawl_cache` table)**:
   - Crawl results (DOM elements) are cached for 24 hours in Neon PostgreSQL (`crawl_cache`).
   - Re-running or chatting about the same URL skips Playwright crawling entirely, saving ~40-60% of LLM token cost.
2. **On-Demand Script Generation (`/api/generate/script`)**:
   - Initial generation produces ONLY structured `.xlsx` test cases (minimal token usage).
   - Automation scripts (`.spec.ts` / `.feature`) are generated on-demand when explicitly requested in chat.
3. **Usage Tracking (`usage_log` table)**:
   - Every LLM call is logged with provider, model, token count, and cache token metrics.
   - Powers the Executive Report and usage summaries; auto-pruned after 30 days.

## Files To Check First
- Route Group Layout: `src/app/(dashboard)/layout.tsx` — server-side `auth()` check, renders `DashboardShell`.
- Middleware: `middleware.ts` — protects all routes except those in `src/lib/authPolicy.mjs`.
- Shared Dashboard Context: `src/components/DashboardContext.tsx`
- Dashboard Shell (sidebar + page host): `src/components/DashboardShell.tsx`
- Sidebar nav config: `src/components/Sidebar.tsx` (defines `PageId` union and `NAV_ITEMS`).
- Dashboard Page: `src/components/pages/DashboardPage.tsx`
- Test Case Agent Page: `src/components/pages/GenerateChatPage.tsx`
- Issue Ticket Agent Page: `src/components/pages/TicketPage.tsx`
- QA Squad Page: `src/components/pages/SquadPage.tsx`
- Test Planner Page: `src/components/pages/PlannerPage.tsx`
- API Test Agent Page: `src/components/pages/ApiAgentPage.tsx`
- Test Data Generator Page: `src/components/pages/DataGenPage.tsx`
- Executive Report Page: `src/components/pages/ReportPage.tsx`
- On-Demand Script API: `src/app/api/generate/script/route.ts`
- SSE Generator Stream: `src/app/api/generate/stream/route.ts`
- Sandbox Test Runner: `src/app/api/runner/execute/route.ts` (local-only; 501 on Vercel).
- Squad Orchestration API: `src/app/api/squad/orchestrate/route.ts`
- DB Schema & Migrations: `src/app/api/db.ts`
- AI Provider & Model Settings: `src/components/AISettings.tsx`
- Auth config: `src/auth.ts`
- Public-route policy: `src/lib/authPolicy.mjs`

## API Surface (by domain)
- **Generation**: `generate/stream` (SSE chat), `generate/script` (on-demand scripts).
- **Agents**: `api-agent/generate`, `planner`, `data/generate`, `ticket/generate`, `squad/orchestrate`, `report/generate`, `unified-chat/repair`.
- **Tickets**: `tickets` (list/create), `tickets/[id]` (CRUD), `jira/create`, `jira/test`.
- **Monitoring**: `monitor` (list/create), `monitor/[id]` (CRUD), `monitor/[id]/check` (selector health check).
- **History & Sessions**: `history`, `history/[id]`, `sessions`, `sessions/[id]` (cloud session sync).
- **Team**: `team` (list/create), `team/[id]`, `team/[id]/invite`, `team/[id]/members`.
- **Share**: `share/[id]` (public result read).
- **Usage**: `usage`, `usage/summary`.
- **Runner**: `runner/execute` (sandboxed Playwright/pytest; local-only), `run-test`.
- **Integrations**: `figma/fetch`, `upload/parse`, `playground/test`, `playground/load`.
- **Platform**: `auth/[...nextauth]`, `keys/validate`, `models`, `dashboard/metrics`, `activity`, `health`, `ai` (LLM client `callLLM`).

## Database Tables (Neon PostgreSQL)
Managed by `initDB()` + `ensureSchema()` in `src/app/api/db.ts`:
- `history` — test generation records (per-user via `user_id`; optional `team_id`).
- `monitored_urls` — per-user watched URLs (unique on `user_id, url`).
- `monitor_snapshots` — selector health snapshots per monitor.
- `crawl_cache` — 24h DOM crawl cache (auto-pruned at 48h).
- `teams` / `team_members` — team workspaces and membership.
- `tickets` — server-side ticket chat sessions per user.
- `usage_log` — LLM call usage tracking (auto-pruned at 30 days).
- `agent_sessions` — unified multi-agent session persistence.

## Mandatory Rules
- **Zero Server Key Storage**: Never persist API keys on the server or in database tables.
- **Fast Check**: Verify build using `npx tsc --noEmit` before finishing any task.
- **No Hardcoded Models**: AI provider and model choices must always be dynamically selected by the user.
- **Strict English UI**: All user-facing UI labels, tooltips, placeholders, and error messages must be in English.
- **Idempotent DB Migrations**: All new schema fields must be added to `ensureSchema()` in `src/app/api/db.ts` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- **Auth Required**: All `(dashboard)/*` routes and non-public API routes require a valid Auth.js session. Public routes are defined in `src/lib/authPolicy.mjs`.
