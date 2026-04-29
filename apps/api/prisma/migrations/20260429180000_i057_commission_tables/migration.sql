-- I057 — Sales Commissions tables (T43)
-- The schema declared CommissionPlan/Rule/Assignment/Entry models since
-- Wave 5 but no migration ever created the underlying commission_* tables,
-- so commissions.service.ts:listEntries() 500'd in production. Cycle 9 of
-- the I047 self-healing loop added a defensive try/catch returning [], but
-- the proper fix is the missing tables. This migration creates them and
-- replaces the band-aid with real persistence.
--
-- F2 / F3 invariants:
-- - commission_entries is append-only (created_at + created_by; updated_at
--   intentionally absent so Postgres trigger can later forbid UPDATE).
-- - amount_iqd is SIGNED (clawbacks are negative). Status defaults to
--   'accrued'. The companion JE id (journal_entry_id) is nullable until
--   PostingService writes the GL entry.

-- ── commission_plans ────────────────────────────────────────────────────────
CREATE TABLE "commission_plans" (
  "id"          CHAR(26)        NOT NULL DEFAULT gen_ulid(),
  "companyId"   CHAR(26)        NOT NULL,
  "code"        VARCHAR(40)     NOT NULL,
  "nameAr"      VARCHAR(200)    NOT NULL,
  "nameEn"      VARCHAR(200),
  "basis"       VARCHAR(20)     NOT NULL DEFAULT 'sales',
  "kind"        VARCHAR(20)     NOT NULL DEFAULT 'flat',
  "flatPct"     DECIMAL(7, 4)   NOT NULL DEFAULT 0,
  "validFrom"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil"  TIMESTAMP(3),
  "isActive"    BOOLEAN         NOT NULL DEFAULT true,
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)    NOT NULL,
  "createdBy"   CHAR(26)        NOT NULL,

  CONSTRAINT "commission_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commission_plans_companyId_code_key"
  ON "commission_plans" ("companyId", "code");

CREATE INDEX "commission_plans_companyId_isActive_idx"
  ON "commission_plans" ("companyId", "isActive");

-- ── commission_rules ────────────────────────────────────────────────────────
CREATE TABLE "commission_rules" (
  "id"         CHAR(26)        NOT NULL DEFAULT gen_ulid(),
  "planId"     CHAR(26)        NOT NULL,
  "fromAmount" DECIMAL(18, 3),
  "toAmount"   DECIMAL(18, 3),
  "productId"  CHAR(26),
  "categoryId" CHAR(26),
  "pct"        DECIMAL(7, 4)   NOT NULL,
  "sortOrder"  INTEGER         NOT NULL DEFAULT 0,

  CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commission_rules_planId_idx"
  ON "commission_rules" ("planId");

ALTER TABLE "commission_rules"
  ADD CONSTRAINT "commission_rules_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "commission_plans" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── commission_assignments ─────────────────────────────────────────────────
CREATE TABLE "commission_assignments" (
  "id"           CHAR(26)        NOT NULL DEFAULT gen_ulid(),
  "companyId"    CHAR(26)        NOT NULL,
  "planId"       CHAR(26)        NOT NULL,
  "employeeId"   CHAR(26),
  "promoterName" VARCHAR(200),
  "validFrom"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil"   TIMESTAMP(3),
  "isActive"     BOOLEAN         NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"    CHAR(26)        NOT NULL,

  CONSTRAINT "commission_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commission_assignments_companyId_employeeId_idx"
  ON "commission_assignments" ("companyId", "employeeId");

CREATE INDEX "commission_assignments_planId_isActive_idx"
  ON "commission_assignments" ("planId", "isActive");

ALTER TABLE "commission_assignments"
  ADD CONSTRAINT "commission_assignments_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "commission_plans" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── commission_entries (append-only ledger) ────────────────────────────────
-- F2: signed amount_iqd. F3-style append-only — no updatedAt column on this
-- table; updates are done by inserting a clawback / adjustment row, never
-- by mutating an existing row.
CREATE TABLE "commission_entries" (
  "id"              CHAR(26)        NOT NULL DEFAULT gen_ulid(),
  "companyId"       CHAR(26)        NOT NULL,
  "branchId"        CHAR(26),
  "planId"          CHAR(26)        NOT NULL,
  "employeeId"      CHAR(26),
  "promoterName"    VARCHAR(200),
  "kind"            VARCHAR(20)     NOT NULL,
  "refType"         VARCHAR(50)     NOT NULL,
  "refId"           CHAR(26)        NOT NULL,
  "baseAmountIqd"   DECIMAL(18, 3)  NOT NULL,
  "pctApplied"      DECIMAL(7, 4)   NOT NULL,
  "amountIqd"       DECIMAL(18, 3)  NOT NULL,
  "status"          VARCHAR(20)     NOT NULL DEFAULT 'accrued',
  "journalEntryId"  CHAR(26),
  "paidInPayrollId" CHAR(26),
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"       CHAR(26)        NOT NULL,

  CONSTRAINT "commission_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_entries_kind_check"   CHECK ("kind"   IN ('accrual','clawback','adjustment')),
  CONSTRAINT "commission_entries_status_check" CHECK ("status" IN ('accrued','paid','reversed'))
);

CREATE INDEX "commission_entries_companyId_employeeId_createdAt_idx"
  ON "commission_entries" ("companyId", "employeeId", "createdAt");

CREATE INDEX "commission_entries_companyId_refType_refId_idx"
  ON "commission_entries" ("companyId", "refType", "refId");

CREATE INDEX "commission_entries_companyId_status_idx"
  ON "commission_entries" ("companyId", "status");

ALTER TABLE "commission_entries"
  ADD CONSTRAINT "commission_entries_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "commission_plans" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
