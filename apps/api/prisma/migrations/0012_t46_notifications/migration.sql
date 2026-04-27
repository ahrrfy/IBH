-- ─────────────────────────────────────────────────────────────────────────────
-- T46 — Notification Dispatch Engine
--
-- Adds 2 tables:
--   1. notifications            — per-user notification records (in-app inbox)
--   2. notification_preferences — per-user, per-event channel + quiet-hours config
--
-- Conventions:
--   - CHAR(26) ULID ids via gen_ulid()
--   - camelCase column names (matches existing schema)
--   - snake_case table names (Prisma @@map)
--   - All DDL is idempotent
-- ─────────────────────────────────────────────────────────────────────────────

-- notifications --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "notifications" (
  "id"        CHAR(26)     PRIMARY KEY DEFAULT gen_ulid(),
  "companyId" CHAR(26)     NOT NULL,
  "userId"    CHAR(26)     NOT NULL,
  "eventType" VARCHAR(80)  NOT NULL,
  "title"     VARCHAR(200) NOT NULL,
  "body"      VARCHAR(2000) NOT NULL,
  "data"      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  "readAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "notifications_userId_readAt_idx"
  ON "notifications" ("userId", "readAt");

CREATE INDEX IF NOT EXISTS "notifications_companyId_eventType_idx"
  ON "notifications" ("companyId", "eventType");

-- notification_preferences ---------------------------------------------------

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id"              CHAR(26)    PRIMARY KEY DEFAULT gen_ulid(),
  "userId"          CHAR(26)    NOT NULL,
  "eventType"       VARCHAR(80) NOT NULL,
  "channels"        TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "quietHoursStart" VARCHAR(5),
  "quietHoursEnd"   VARCHAR(5),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_userId_eventType_key"
  ON "notification_preferences" ("userId", "eventType");

CREATE INDEX IF NOT EXISTS "notification_preferences_userId_idx"
  ON "notification_preferences" ("userId");
