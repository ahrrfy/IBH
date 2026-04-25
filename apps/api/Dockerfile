# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP API — Multi-stage Dockerfile
# Stage 1: deps       — install all dependencies
# Stage 2: builder    — compile TypeScript
# Stage 3: production — minimal runtime image
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=22

# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests first (Docker layer cache optimization)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/validation-schemas/package.json ./packages/validation-schemas/
COPY packages/domain-events/package.json ./packages/domain-events/

RUN pnpm install --no-frozen-lockfile --ignore-scripts

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

# Copy source code
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/shared-types ./packages/shared-types
COPY packages/validation-schemas ./packages/validation-schemas
COPY packages/domain-events ./packages/domain-events

# Generate Prisma client
RUN pnpm --filter api exec prisma generate

# Build the API
RUN pnpm --filter api build

# ── Stage 3: Production ──────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS production

RUN corepack enable && corepack prepare pnpm@latest --activate

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nestjs

WORKDIR /app

# Copy only production artifacts
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./package.json

USER nestjs

EXPOSE 3000

ENV NODE_ENV=production

# Health check — used by Docker and Nginx upstream health
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
