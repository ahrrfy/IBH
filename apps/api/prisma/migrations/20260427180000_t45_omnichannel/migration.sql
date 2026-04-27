-- ─────────────────────────────────────────────────────────────────────────────
-- T45 — Omnichannel Order Inbox
--
-- Adds 2 tables:
--   1. omnichannel_messages      — inbound messages from WA/FB/IG (idempotent
--                                  by (channel, externalId))
--   2. omnichannel_draft_orders  — extracted order intents (Tier 3 rule-based)
--
-- Conventions:
--   - CHAR(26) ULID ids via gen_ulid()
--   - camelCase columns / snake_case table names (Prisma @@map)
--   - All DDL is idempotent
-- ─────────────────────────────────────────────────────────────────────────────

-- omnichannel_draft_orders ---------------------------------------------------

CREATE TABLE IF NOT EXISTS "omnichannel_draft_orders" (
  "id"             CHAR(26)     PRIMARY KEY DEFAULT gen_ulid(),
  "messageId"      CHAR(26)     NOT NULL,
  "customerId"     CHAR(26),
  "items"          JSONB        NOT NULL DEFAULT '[]'::jsonb,
  "notes"          TEXT,
  "confidence"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "approvedAt"     TIMESTAMP(3),
  "rejectedReason" VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS "omnichannel_draft_orders_messageId_idx"
  ON "omnichannel_draft_orders" ("messageId");

-- omnichannel_messages -------------------------------------------------------

CREATE TABLE IF NOT EXISTS "omnichannel_messages" (
  "id"           CHAR(26)     PRIMARY KEY DEFAULT gen_ulid(),
  "companyId"    CHAR(26)     NOT NULL,
  "channel"      VARCHAR(20)  NOT NULL,
  "externalId"   VARCHAR(120) NOT NULL,
  "fromHandle"   VARCHAR(120) NOT NULL,
  "body"         TEXT         NOT NULL,
  "receivedAt"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "processedAt"  TIMESTAMP(3),
  "draftOrderId" CHAR(26),
  "status"       VARCHAR(20)  NOT NULL DEFAULT 'new',
  CONSTRAINT "omnichannel_messages_status_check"
    CHECK ("status" IN ('new','drafted','approved','rejected','spam')),
  CONSTRAINT "omnichannel_messages_channel_check"
    CHECK ("channel" IN ('whatsapp','facebook','instagram')),
  CONSTRAINT "omnichannel_messages_draftOrderId_fkey"
    FOREIGN KEY ("draftOrderId") REFERENCES "omnichannel_draft_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "omnichannel_messages_channel_externalId_key"
  ON "omnichannel_messages" ("channel", "externalId");

CREATE INDEX IF NOT EXISTS "omnichannel_messages_companyId_status_idx"
  ON "omnichannel_messages" ("companyId", "status");
