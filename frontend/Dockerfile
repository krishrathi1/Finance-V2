FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NODE_ENV=production
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/loaders ./loaders
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

# init-db is idempotent (CREATE TABLE IF NOT EXISTS) — safe on every boot.
CMD ["sh", "-c", "node scripts/init-db.js && npm start -- -p 3000 -H 0.0.0.0"]
