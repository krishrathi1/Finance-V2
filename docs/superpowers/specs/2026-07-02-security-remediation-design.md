# Security Remediation — Design

Date: 2026-07-02
Status: Approved (track 1 of a multi-track "market ready" initiative)

## Context

A full-codebase audit found real secrets and a production DB dump committed to
git in a private GitHub repo (`krishrathi1/Finance-V2`), plus insecure
defaults and public exposure of Postgres/Redis in the prod compose file.
Since the repo is private, this track focuses on stopping future leaks and
hardening defaults rather than rewriting git history.

## Findings in scope

1. `backend/.env.prod`, `letsgoenvironment.txt`, `database/db_dump_*.sql`
   (x2) are tracked in git with real-looking API keys, S3 credentials, an
   SMTP password, and a DB dump containing real user rows (bcrypt hash,
   hashed refresh token).
2. `.gitignore`'s `*.env` rule does not match `*.env.prod`.
3. `backend/app/core/config.py` defaults `jwt_secret_key` to `""`;
   `frontend/middleware.ts` falls back to a hardcoded placeholder string
   when `JWT_SECRET_KEY` is unset — both make admin JWTs forgeable if the
   env var is ever missing.
4. `docker-compose.prod.yml` publishes Postgres (`5432`) and Redis (`6379`)
   to all interfaces, Redis has no auth, and Postgres uses a hardcoded
   default password (`ffa_prod_password_change_me`) written directly in the
   compose file.

## Decisions (approved by user)

- **No git history rewrite.** Repo is private; user will rotate the actual
  secret values, which neutralizes the leaked ones without a disruptive
  force-push/history rewrite.
- Rotation of the real secret values (FMP, NewsAPI, Gemini, S3, SMTP, DB
  password, `JWT_SECRET_KEY`) is done by the user directly with each
  provider — not something this session can perform.

## Plan

1. `git rm --cached` the four tracked secret files (contents stay on disk,
   untouched).
2. Extend `.gitignore` to cover `*.env.prod`, `letsgoenvironment.txt`,
   `database/*.sql`.
3. Add `backend/.env.prod.example` and confirm `frontend/.env.prod.example`
   exist, listing every required key with placeholder values, so the
   now-gitignored files stay reproducible/documented.
4. Make `JWT_SECRET_KEY` required-at-startup (raise/fail fast) in both
   `backend/app/core/config.py` and `frontend/middleware.ts` instead of
   silently defaulting.
5. `docker-compose.prod.yml`: drop host port publishing for `postgres` and
   `redis` (services stay reachable over the internal compose network),
   require `POSTGRES_PASSWORD`/Redis auth via env var instead of a literal
   default.

## Out of scope (tracked separately)

- Backend infra correctness (fake Redis cache, broken DB driver
  config) — next track per user's stated priority.
- Frontend/AI/pipeline reliability, testing, CI — later tracks.
