# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP Storefront — Multi-stage Dockerfile (Next.js 15 standalone)
# Public e-commerce UI (read-only product catalog + checkout).
# Listens on :3002. Modeled after apps/web/Dockerfile.
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=22

# ── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/storefront/package.json ./apps/storefront/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/validation-schemas/package.json ./packages/validation-schemas/

RUN pnpm install --no-frozen-lockfile --ignore-scripts

# ── Stage 2: build ──────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=deps /app ./

COPY tsconfig.base.json ./
COPY apps/storefront ./apps/storefront
COPY packages/shared-types ./packages/shared-types
COPY packages/validation-schemas ./packages/validation-schemas

RUN pnpm --filter '@erp/shared-types' build \
 && pnpm --filter '@erp/validation-schemas' build

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @erp/storefront build

# ── Stage 3: production ─────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS production
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/public ./apps/storefront/public

USER nextjs

ENV NODE_ENV=production
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3002

# Probe '/' on 127.0.0.1 (Alpine localhost-IPv6 trap; see web Dockerfile).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --spider -q -t 1 http://127.0.0.1:3002/ || exit 1

CMD ["node", "apps/storefront/server.js"]
