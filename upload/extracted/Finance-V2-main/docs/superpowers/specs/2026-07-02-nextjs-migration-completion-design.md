# Finish the Next.js Migration — Design

Date: 2026-07-02
Status: Approved (track 2 of the "market ready" initiative)

## Context

The repo contains two parallel backends:

- **Next.js backend** (`frontend/app/api/v1/**` + `frontend/lib/backend/**`):
  ~40 routes covering auth (MySQL via `mysql2`), dashboard, screener, IPO,
  SWOT, portfolio parsing, AI chat, scoring. This is what dev runs (both
  API bases in `.env.local` point at `localhost:3000`) and what recent
  development targets. `NEXTJS_MYSQL_SETUP.md` documents the migration
  intent explicitly.
- **Legacy FastAPI backend** (`backend/app/**` + `ai-engine/`): the
  pre-migration stack. Production nginx routes `/api` to it and prod SSR
  points at it, but it is broken in prod: `DATABASE_URL` requires
  `asyncpg`, which is not installed (only MySQL drivers are); its Redis
  cache is an admitted in-memory placeholder; its scoring/dashboard logic
  is a stale Python duplicate of the maintained TS code.

Net effect: dev and prod run different codebases for the same endpoints.

## Decision (approved by user)

**Next.js-only.** Finish the migration: prod runs what dev runs, and the
legacy Python stack is deleted (preserved in git history). Considered and
rejected: fixing FastAPI as prod backend (maintains duplicate scoring/auth
logic forever, contradicts the migration doc) and an intentional hybrid
(most work, two engines to keep in sync).

## Parity analysis (verified 2026-07-02)

All FastAPI stock/portfolio routes have same-path Next.js equivalents
except `GET /stocks/screener/sectors` (no callers — dropped). Gaps that
must be ported, all actively called by pages and 404ing in dev today:

- `GET /api/v1/auth/me`
- `POST /api/v1/auth/premium-request` (called by `premium-request/page.tsx`)
- `GET /api/v1/auth/premium-request` (called by `(dashboard)/dashboard/page.tsx`)
- `GET /api/v1/auth/verify-email` (called by `verify-email/page.tsx`)

The 8 FastAPI `/admin/*` endpoints are NOT ported: no admin UI pages exist
anywhere. An admin panel is a separate future feature track.

`ai-engine/` is imported only by FastAPI; the frontend has its own TS port
(`lib/backend/ai/`). `data-pipeline/` is standalone and stays.

## Plan

### 1. Port missing routes (fixes live 404 bugs)

New Next.js route handlers backed by the existing MySQL helpers
(`lib/db.ts`, `lib/auth-utils.ts`), mirroring FastAPI behavior:
`auth/me`, `auth/premium-request` (GET+POST, uses the `premium_requests`
table that `scripts/init-db.js` already creates), `auth/verify-email`.

### 2. Auth secret hardening

`lib/auth-utils.ts:5` signs and verifies JWTs with a hardcoded fallback
secret when `JWT_SECRET_KEY` is unset — forgeable tokens. Change to
fail-fast (throw at module load). Matches the middleware fix from track 1.

### 3. Production rewiring

- `docker-compose.prod.yml`: remove `postgres`, `redis`, `backend`
  services; add `mysql:8` (internal network only, no host ports, password
  via env substitution, healthcheck); frontend service gets full env from
  `frontend/.env.prod` and depends on healthy MySQL.
- `deploy/nginx/mystockvision.conf`: delete the `/api → :8000` block;
  `location /` already proxies everything to Next.js on `:3000`.
- `frontend/.env.prod(.example)`: full key set — `MYSQL_*`,
  `JWT_SECRET_KEY`, `SMTP_*`, `FMP/GEMINI/NEWS` keys,
  `INTERNAL_API_BASE=http://127.0.0.1:3000` (SSR calls loop back to the
  same container).
- `frontend/Dockerfile`: copy `scripts/` and `loaders/` into the runner
  stage; container start runs idempotent `node scripts/init-db.js` before
  `next start`.
- Add `frontend/app/api/health/route.ts` for LB/compose healthchecks.

### 4. Legacy deletion and docs

Delete `backend/`, `ai-engine/`, `render.yaml`, `fix_backend.py`,
`frontend/lib/init-schema.ts` (dead code, wrong schema). Update
`data-pipeline/scripts/validate_scoring_engine.py` default base URL to
`http://127.0.0.1:3000`. Rewrite `README.md` and `API_TASK_MAP.md` to
describe the Next.js-only architecture. Root `docker-compose.yml` (dev)
becomes MySQL-only (app runs via `npm run dev`).

## Error handling

- Missing `JWT_SECRET_KEY` or `MYSQL_*`: process fails at startup with a
  clear message rather than running insecurely/brokenly.
- `init-db` is idempotent (`CREATE TABLE IF NOT EXISTS`); a MySQL outage
  at boot fails the container (restart: always retries).

## Testing / verification

- `npm run build` passes.
- Dev boot against local MySQL: register → login → `GET /auth/me` →
  `POST/GET premium-request` → logout flow exercised end-to-end.
- `docker compose -f docker-compose.prod.yml config` validates with env
  vars set.
- Grep confirms no remaining references to `backend:8000`, `ai_engine`,
  or deleted paths.

## Out of scope (later tracks)

Admin panel UI + endpoints; rate limiting and provider-error logging in
the TS layer (track 2b); Gemini retry/backoff (track 3); frontend polish
(track 4); CI gate (track 5).
