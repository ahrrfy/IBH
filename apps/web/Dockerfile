# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP Web Admin — Multi-stage Dockerfile (Next.js 15 standalone)
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=22

# ── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/validation-schemas/package.json ./packages/validation-schemas/

RUN pnpm install --no-frozen-lockfile --ignore-scripts

# ── Stage 2: build ──────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=deps /app ./

COPY tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/shared-types ./packages/shared-types
COPY packages/validation-schemas ./packages/validation-schemas

# Build workspace packages first
RUN pnpm --filter '@erp/shared-types' build \
 && pnpm --filter '@erp/validation-schemas' build

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

# ── Stage 3: production ─────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS production
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3001

# Probe /login (known to return 200) instead of / (which middleware redirects
# to /login → 307, and busybox wget -qO- treats redirects as failure on some
# Alpine builds). --spider returns success on any 2xx. Closes I012 (web part).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --spider -q -t 1 http://localhost:3001/login || exit 1

CMD ["node", "apps/web/server.js"]
