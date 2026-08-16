# Production image for the MyStockVision Next.js app.
#
# Built to be HANDED TO SOMEONE ELSE: no secrets, no domain, no database
# baked in. Every one of those is supplied at run time, so the same image
# tarball runs unchanged on any server the recipient owns.
#
# Two things make that portable-by-construction rather than by convention:
#   - the browser calls the API on relative paths (/api/v1/...), so no public
#     URL is compiled into the client bundle;
#   - the server reads INTERNAL_API_BASE from the environment at run time,
#     because only NEXT_PUBLIC_* names get inlined at build time.
# Consequently there is deliberately no NEXT_PUBLIC_API_BASE build arg here.
# Adding one back would nail this image to one domain.

# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` needs the dev dependencies: the build runs TypeScript and Tailwind.
RUN npm ci

# ── build ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
# Silence Next's anonymous usage collection in CI/build environments.
ENV NEXT_TELEMETRY_DISABLED=1
# JWT_SECRET_KEY is set inline for this one command rather than as ENV. Next
# evaluates module scope while prerendering, so the build needs *a* value, but
# an ENV would be recorded in the image's metadata — and an image that ships
# with something shaped like a signing key invites someone to trust it. Set
# this way it exists only for the duration of the build step. The real key is
# supplied at run time.
RUN JWT_SECRET_KEY=build-time-placeholder-not-a-real-key npm run build

# ── db bootstrap deps ────────────────────────────────────────────────────────
# scripts/init-db.js is a plain Node script, not part of the Next build, so
# webpack never sees it. Next's standalone output ships only the ~15 modules
# its own runtime traces; every application dependency, mysql2 included, is
# bundled *inside* the compiled server chunks. That works for the app and not
# at all for a standalone script, which fails at require('mysql2/promise').
#
# So mysql2 is installed once into its own tree and dropped beside the script.
# Node resolves node_modules from the requiring file's directory upward, so
# scripts/node_modules is found first and nothing else in the image is
# affected. The version is read out of package.json rather than repeated here,
# so this cannot drift from what the app itself was built against.
FROM node:20-alpine AS dbtools
WORKDIR /dbtools
COPY package.json ./source-package.json
RUN npm init -y > /dev/null \
 && npm install --omit=dev --no-fund --no-audit \
      "mysql2@$(node -p "require('./source-package.json').dependencies.mysql2")"

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# wget backs the container healthcheck; curl is not in node:20-alpine.
RUN apk add --no-cache wget

# Run unprivileged. If the app is ever compromised, the attacker lands as a
# user that owns nothing rather than as root inside the container.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# `standalone` already contains the pruned node_modules and a server.js entry
# point; static assets and public/ are not traced into it and must come across
# separately.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# The schema bootstrap. It only needs mysql2 and @next/env, both of which the
# standalone trace already includes because the API routes import them.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=dbtools --chown=nextjs:nodejs /dbtools/node_modules ./scripts/node_modules

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

# init-db is idempotent (CREATE TABLE IF NOT EXISTS), so running it on every
# boot is safe and means a fresh database needs no manual setup step.
CMD ["sh", "-c", "node scripts/init-db.js && node server.js"]
