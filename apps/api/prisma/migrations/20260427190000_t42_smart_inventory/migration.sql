-- ─────────────────────────────────────────────────────────────────────────────
-- T42 — Smart Inventory Engine (Q01..Q12 + Auto-Reorder)
--
-- Adds 2 additive tables:
--   1. inventory_flags    — current health flags raised by the rules engine
--   2. auto_reorder_runs  — audit trail of nightly engine scans
--
-- All DDL is idempotent so re-running on a partially migrated DB is safe.
-- RLS is enforced via current_company_id() — same pattern as Waves 2-6.
-- ─────────────────────────────────────────────────────────────────────────────

-- inventory_flags ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "inventory_flags" (
  "id"          CHAR(26)        NOT NULL DEFAULT gen_ulid(),
  "companyId"   CHAR(26)        NOT NULL,
  "variantId"   CHAR(26)        NOT NULL,
  "warehouseId" CHAR(26)        NOT NULL,
  "ruleCode"    VARCHAR(8)      NOT NULL,
  "severity"    VARCHAR(16)     NOT NULL,
  "messageAr"   VARCHAR(500)    NOT NULL,
  "messageEn"   VARCHAR(500),
  "metric"      DECIMAL(18, 3),
  "threshold"   DECIMAL(18, 3),
  "payload"     JSONB           NOT NULL DEFAULT '{}',
  "detectedAt"  TIMESTAMP(3)    NOT NULL DEFAULT NOW(),
  "resolvedAt"  TIMESTAMP(3),
  "resolvedBy"  CHAR(26),
  "createdAt"   TIMESTAMP(3)    NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP(3)    NOT NULL DEFAULT NOW(),

  CONSTRAINT "inventory_flags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_flags_severity_check"
    CHECK ("severity" IN ('info', 'warning', 'critical')),
  CONSTRAINT "inventory_flags_rule_code_check"
    CHECK ("ruleCode" ~ '^Q(0[1-9]|1[0-2])$')
);

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_flags_variant_wh_rule_uniq"
  ON "inventory_flags" ("variantId", "warehouseId", "ruleCode");

CREATE INDEX IF NOT EXISTS "inventory_flags_company_rule_severity_idx"
  ON "inventory_flags" ("companyId", "ruleCode", "severity");

CREATE INDEX IF NOT EXISTS "inventory_flags_company_resolved_idx"
  ON "inventory_flags" ("companyId", "resolvedAt");

ALTER TABLE "inventory_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_flags" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON "inventory_flags"
    USING ("companyId" = current_company_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER inventory_flags_updated_at
    BEFORE UPDATE ON "inventory_flags"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- auto_reorder_runs --------------------------------------------------------

CREATE TABLE IF NOT EXISTS "auto_reorder_runs" (
  "id"              CHAR(26)      NOT NULL DEFAULT gen_ulid(),
  "companyId"       CHAR(26)      NOT NULL,
  "startedAt"       TIMESTAMP(3)  NOT NULL DEFAULT NOW(),
  "completedAt"     TIMESTAMP(3),
  "status"          VARCHAR(16)   NOT NULL,
  "triggeredBy"     CHAR(26),
  "scannedSkus"     INTEGER       NOT NULL DEFAULT 0,
  "flagsCreated"    INTEGER       NOT NULL DEFAULT 0,
  "flagsResolved"   INTEGER       NOT NULL DEFAULT 0,
  "draftPosCreated" INTEGER       NOT NULL DEFAULT 0,
  "errorMessage"    VARCHAR(2000),
  "payload"         JSONB         NOT NULL DEFAULT '{}',

  CONSTRAINT "auto_reorder_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auto_reorder_runs_status_check"
    CHECK ("status" IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS "auto_reorder_runs_company_started_idx"
  ON "auto_reorder_runs" ("companyId", "startedAt");

ALTER TABLE "auto_reorder_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auto_reorder_runs" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON "auto_reorder_runs"
    USING ("companyId" = current_company_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
