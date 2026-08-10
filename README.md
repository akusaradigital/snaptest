# 🤖 SnapTest - AI Quality Assurance Platform

SnapTest is a modern, unified Next.js 14 web application designed to accelerate software testing workflows. It transforms raw inputs (URLs, Screenshots, Figma mockups, OpenAPI specs, or PRD text) into structured Test Cases, executable Automation Scripts, API test suites, mock test data, and well-formatted Jira tickets — all powered by AI.

Beyond single-purpose generation, SnapTest ships a **QA Squad Orchestrator** that runs one high-level command across specialized sub-agents, plus an **Executive Report** generator that summarizes your last 30 days of QA activity.

## Key Features

- 💬 **Conversational AI Agents**: Unified chat interfaces for Test Generation, Ticket Creation, and Multi-Agent Orchestration.
- 🤖 **QA Squad Orchestrator**: One command, multiple sub-agents (test cases, test data, API tests, planner, script repair, coverage check) — orchestrated automatically.
- 🚀 **On-Demand Generation**: AI generates minimal Test Cases first. Automation scripts are created strictly on-demand via chat to heavily optimize AI Token usage.
- ⚡ **URL Crawl Caching**: Intelligent 24-hour DOM caching via Neon PostgreSQL to prevent repetitive and expensive re-crawling.
- 🗂️ **Split-View File Workspace**: IDE-like tabbed workspace for Test Cases (`.xlsx`), Playwright/Cypress (`.spec.ts`), and Gherkin (`.feature`) directly side-by-side with your chat.
- 🌐 **API Test Agent**: Paste cURL, OpenAPI, or Postman specs to generate API test suites and Postman collections. Supports multi-path OpenAPI and native file upload.
- 📋 **Test Planner**: Turn PRDs, User Stories, Acceptance Criteria, or Gherkin into a structured test matrix with priority and effort estimation. Export to CSV/XLSX.
- 🗃️ **Test Data Generator**: Describe fields or paste a JSON schema to generate mock, boundary, and negative payloads. Export as JSON/CSV.
- 📊 **Executive Report**: One-click professional QA summary report from your last 30 days of testing activity, Jira tickets, and AI usage. Print to PDF.
- 🧠 **Multi-AI & 9Router Support**: Agnostic provider integration (OpenAI, Anthropic, Gemini, Groq, DeepSeek, Moonshot, Qwen, local models via 9Router). No keys are ever stored server-side.
- 🔐 **Privacy First**: Zero server-side API key storage; everything lives entirely within your browser's local storage.
- 🎫 **Jira Automation**: One-click Jira ticket creation mapped directly from chat agent analysis.
- 🏃 **Sandbox Test Runner**: Execute generated Playwright/pytest scripts locally in an isolated process with screenshot capture and pass/fail step breakdown.
- 📈 **Dashboard & Metrics**: Overview of your active monitors, total generated tests, and team members pulled from Neon DB.

## Architecture & Tech Stack

SnapTest is built entirely as a monolithic **Next.js 14 App Router** application, shedding the legacy separation of Frontend/Backend.

```text
Next.js 14 (App Router)
 ├── Route Groups [(dashboard)] for layout persistence
 ├── Middleware + Auth.js (NextAuth) for Google SSO & route protection
 ├── Server-Sent Events (SSE) for Real-time Streaming Output
 ├── Neon PostgreSQL Serverless (Database, Caching & Usage Tracking)
 └── Sandboxed Playwright/pytest Runner (local-only)
```

### Routing Structure

- `/` — Public marketing landing page (features, providers, FAQ).
- `/login` — Google SSO sign-in.
- `/dashboard` — Landing overview & quick actions.
- `/squad` — **QA Squad Orchestrator**: Multi-agent command execution.
- `/generate` — **Test Case Agent**: Chat + File Workspace IDE.
- `/planner` — **Test Planner**: PRD/Story → test matrix.
- `/ticket` — **Issue & Ticket Agent**: Chat-based bug reporter.
- `/api-agent` — **API Test Agent**: cURL/OpenAPI/Postman → API test suites.
- `/data` — **Test Data Generator**: Schema → mock/boundary data.
- `/report` — **Executive Report**: One-click QA summary (print to PDF).
- `/history` — Persistent log and database history.
- `/settings` — Configuration for API keys, Jira PAT, and Custom Prompts.
- `/share/[id]` — Public read-only shared result view.

## Quick Start

### Prerequisites

- Node.js 18+
- Neon PostgreSQL Database URL
- At least one AI API key or a local 9Router instance
- (Optional) Python + Playwright for the local sandbox test runner

### Installation & Running

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables in your `.env.local`:
   ```env
   DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
   AUTH_SECRET=your_nextauth_secret
   AUTH_GOOGLE_ID=your_google_id
   AUTH_GOOGLE_SECRET=your_google_secret
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000`. Sign in with Google, navigate to **Settings** to securely attach your AI API Key to the browser, then start generating!

5. (Optional) Run tests:
   ```bash
   npm test
   ```

## Documentation for Agents

If you are an AI assistant helping with this codebase, refer to `AGENTS.md` in the root directory for strict architectural constraints, database patterns, API surface, and token management rules.
