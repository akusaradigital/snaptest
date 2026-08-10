# Project: TestGen Studio

## Rules

- **Never push to GitHub unless the user explicitly asks.** "Fix this" or "update this" does NOT mean push. Wait for the user to say "push" or "deploy" before running `git push`.
- **Never hardcode API keys.** Users must enter them manually in the app (via AISettings). No keys in env files committed to git, no keys in source code.

## Stack

- Next.js App Router (fullstack - API routes in `src/app/api/`)
- Neon PostgreSQL (`@neondatabase/serverless`) - requires `DATABASE_URL` env var
- Vercel deployment - filesystem is read-only, no SQLite, no local file writes

## Local dev

- API routes and frontend run on the same port (Next.js dev server), so `API_URL = ""` (relative) works correctly
- `DATABASE_URL` must be set in `.env.local` to connect to Neon
- 9Router provider is only shown when `window.location.hostname === "localhost"`
