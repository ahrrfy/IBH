-- ─────────────────────────────────────────────────────────────────────────────
-- T53 — HR Salary Bands + Promotions Approval Workflow
--
-- Adds 3 new tables:
--   1. salary_bands        — allowable compensation ranges per grade + sub-band
--   2. hr_promotions       — promotion requests (snapshot before → proposed after)
--   3. promotion_approvals — append-only 2-step approval log
--
-- Adds 2 new enums:
--   - hr_promotion_status       (draft | pending_hr | pending_director | approved | rejected | cancelled)
--   - promotion_approval_result (approved | rejected)
--
-- Design decisions (F1-F4):
--   - salary_bands: min ≤ mid ≤ max enforced at service layer + CHECK constraint.
--   - hr_promotions: captures "before" snapshot at creation; "after" applied only
--     on director approval — ensures human confirmation at both steps.
--   - promotion_approvals: append-only (no UPDATE/DELETE allowed — F2 spirit).
--   - RLS: tenant_isolation policy on every table (companyId = current_company_id()).
--   - All DDL is idempotent (IF NOT EXISTS / EXCEPTION duplicate_object).
-- ─────────────────────────────────────────────────────────────────────────────

-- enums -----------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "HrPromotionStatus" AS ENUM (
    'draft', 'pending_hr', 'pending_director', 'approved', 'rejected', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PromotionApprovalResult" AS ENUM ('approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- salary_bands ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "salary_bands" (
  "id"          CHAR(26)        NOT NULL,
  "companyId"   CHAR(26)        NOT NULL,
  "grade"       VARCHAR(10)     NOT NULL,
  "band"        VARCHAR(5)      NOT NULL,
  "nameAr"      VARCHAR(100)    NOT NULL,
  "minIqd"      DECIMAL(18, 3)  NOT NULL,
  "midIqd"      DECIMAL(18, 3)  NOT NULL,
  "maxIqd"      DECIMAL(18, 3)  NOT NULL,
  "isActive"    BOOLEAN         NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMPTZ     NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ     NOT NULL DEFAULT now(),
  "createdBy"   CHAR(26)        NOT NULL,

  CONSTRAINT "salary_bands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "salary_bands_range_chk"
    CHECK ("minIqd" <= "midIqd" AND "midIqd" <= "maxIqd"),
  CONSTRAINT "salary_bands_grade_band_unique" UNIQUE ("companyId", "grade", "band")
);

CREATE INDEX IF NOT EXISTS "salary_bands_companyId_grade_idx"
  ON "salary_bands" ("companyId", "grade");

-- hr_promotions ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "hr_promotions" (
  "id"                 CHAR(26)              NOT NULL,
  "companyId"          CHAR(26)              NOT NULL,
  "promotionNo"        VARCHAR(30)           NOT NULL,
  "employeeId"         CHAR(26)              NOT NULL,
  "fromPayGradeId"     CHAR(26),
  "fromSalaryBandId"   CHAR(26),
  "fromPositionTitle"  VARCHAR(100),
  "fromSalaryIqd"      DECIMAL(18, 3)        NOT NULL,
  "toPayGradeId"       CHAR(26),
  "toSalaryBandId"     CHAR(26),
  "toPositionTitle"    VARCHAR(100),
  "toSalaryIqd"        DECIMAL(18, 3)        NOT NULL,
  "effectiveDate"      DATE                  NOT NULL,
  "reason"             TEXT,
  "autoSuggestBasis"   VARCHAR(200),
  "status"             "HrPromotionStatus"   NOT NULL DEFAULT 'draft',
  "contractAmendmentId" CHAR(26),
  "createdAt"          TIMESTAMPTZ           NOT NULL DEFAULT now(),
  "updatedAt"          TIMESTAMPTZ           NOT NULL DEFAULT now(),
  "createdBy"          CHAR(26)              NOT NULL,

  CONSTRAINT "hr_promotions_pkey"     PRIMARY KEY ("id"),
  CONSTRAINT "hr_promotions_no_uniq"  UNIQUE ("companyId", "promotionNo"),
  CONSTRAINT "hr_promotions_salary_band_fk"
    FOREIGN KEY ("toSalaryBandId") REFERENCES "salary_bands" ("id")
);

CREATE INDEX IF NOT EXISTS "hr_promotions_companyId_status_idx"
  ON "hr_promotions" ("companyId", "status");
CREATE INDEX IF NOT EXISTS "hr_promotions_companyId_employeeId_idx"
  ON "hr_promotions" ("companyId", "employeeId");

-- promotion_approvals (append-only) ------------------------------------------

CREATE TABLE IF NOT EXISTS "promotion_approvals" (
  "id"           CHAR(26)                    NOT NULL,
  "companyId"    CHAR(26)                    NOT NULL,
  "promotionId"  CHAR(26)                    NOT NULL,
  "step"         SMALLINT                    NOT NULL,
  "decision"     "PromotionApprovalResult"   NOT NULL,
  "approvedBy"   CHAR(26)                    NOT NULL,
  "note"         VARCHAR(500),
  "decidedAt"    TIMESTAMPTZ                 NOT NULL DEFAULT now(),

  CONSTRAINT "promotion_approvals_pkey"     PRIMARY KEY ("id"),
  CONSTRAINT "promotion_approvals_step_uniq" UNIQUE ("promotionId", "step"),
  CONSTRAINT "promotion_approvals_promo_fk"
    FOREIGN KEY ("promotionId") REFERENCES "hr_promotions" ("id")
);

CREATE INDEX IF NOT EXISTS "promotion_approvals_companyId_promo_idx"
  ON "promotion_approvals" ("companyId", "promotionId");

-- RLS -------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "salary_bands" ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation" ON "salary_bands"
    USING ("companyId" = current_setting('app.company_id', true)::CHAR(26));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "hr_promotions" ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation" ON "hr_promotions"
    USING ("companyId" = current_setting('app.company_id', true)::CHAR(26));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "promotion_approvals" ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation" ON "promotion_approvals"
    USING ("companyId" = current_setting('app.company_id', true)::CHAR(26));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Append-only guard on promotion_approvals ------------------------------------
-- Once an approval step is recorded, it must never be modified or deleted.

CREATE OR REPLACE FUNCTION protect_promotion_approvals()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'promotion_approvals is append-only — updates and deletes are forbidden';
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER "no_update_promotion_approvals"
    BEFORE UPDATE ON "promotion_approvals"
    FOR EACH ROW EXECUTE FUNCTION protect_promotion_approvals();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER "no_delete_promotion_approvals"
    BEFORE DELETE ON "promotion_approvals"
    FOR EACH ROW EXECUTE FUNCTION protect_promotion_approvals();
EXCEPTION WHEN duplicate_object THEN null; END $$;
