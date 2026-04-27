-- ─────────────────────────────────────────────────────────────────────────────
-- T51 — HR Recruitment System
--
-- Adds 4 new tables:
--   1. job_postings      — open positions (with public slug for the job board)
--   2. applications      — candidate submissions (state machine on `status`)
--   3. interview_stages  — interview rounds per application (append-only-ish)
--   4. offer_letters     — formal offers extended after successful interviews
--
-- Adds 4 enums:
--   - job_posting_status   (draft | open | paused | closed)
--   - application_status   (new | screened | interview | offer | hired | rejected)
--   - interview_outcome    (pending | passed | failed | no_show)
--   - offer_letter_status  (draft | sent | accepted | rejected | withdrawn | expired)
--
-- RLS: tenant_isolation policy on every table (companyId = current_company_id()).
-- All DDL is idempotent (IF NOT EXISTS / DO $$ … EXCEPTION duplicate_object).
-- ─────────────────────────────────────────────────────────────────────────────

-- enums --------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "JobPostingStatus" AS ENUM ('draft', 'open', 'paused', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ApplicationStatus" AS ENUM ('new', 'screened', 'interview', 'offer', 'hired', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "InterviewOutcome" AS ENUM ('pending', 'passed', 'failed', 'no_show');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "OfferLetterStatus" AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'withdrawn', 'expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. job_postings ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "job_postings" (
  "id"                 CHAR(26) PRIMARY KEY DEFAULT gen_ulid(),
  "companyId"          CHAR(26) NOT NULL,
  "branchId"           CHAR(26),
  "departmentId"       CHAR(26),
  "slug"               VARCHAR(150) NOT NULL,
  "titleAr"            VARCHAR(200) NOT NULL,
  "titleEn"            VARCHAR(200),
  "descriptionAr"      TEXT NOT NULL,
  "requirementsAr"     TEXT,
  "keywords"           VARCHAR(1000),
  "minYearsExperience" INT NOT NULL DEFAULT 0,
  "employmentType"     VARCHAR(30) NOT NULL DEFAULT 'full_time',
  "salaryMinIqd"       DECIMAL(18,3),
  "salaryMaxIqd"       DECIMAL(18,3),
  "location"           VARCHAR(200),
  "status"             "JobPostingStatus" NOT NULL DEFAULT 'draft',
  "openedAt"           TIMESTAMP(3),
  "closedAt"           TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  "createdBy"          CHAR(26) NOT NULL,
  "updatedBy"          CHAR(26) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "job_postings_companyId_slug_key" ON "job_postings"("companyId","slug");
CREATE INDEX IF NOT EXISTS "job_postings_companyId_status_idx" ON "job_postings"("companyId","status");

ALTER TABLE "job_postings" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation ON "job_postings" USING ("companyId" = current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. applications ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "applications" (
  "id"               CHAR(26) PRIMARY KEY DEFAULT gen_ulid(),
  "companyId"        CHAR(26) NOT NULL,
  "jobPostingId"     CHAR(26) NOT NULL REFERENCES "job_postings"("id"),
  "applicantName"    VARCHAR(200) NOT NULL,
  "applicantEmail"   VARCHAR(200) NOT NULL,
  "applicantPhone"   VARCHAR(30),
  "yearsExperience"  INT NOT NULL DEFAULT 0,
  "cvUrl"            VARCHAR(500),
  "cvText"           TEXT,
  "coverLetter"      TEXT,
  "autoScreenScore"  INT NOT NULL DEFAULT 0,
  "status"           "ApplicationStatus" NOT NULL DEFAULT 'new',
  "rejectionReason"  VARCHAR(500),
  "sourceIp"         VARCHAR(64),
  "sourceUa"         VARCHAR(300),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  "reviewedBy"       CHAR(26),
  "reviewedAt"       TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "applications_companyId_status_idx" ON "applications"("companyId","status");
CREATE INDEX IF NOT EXISTS "applications_jobPostingId_status_idx" ON "applications"("jobPostingId","status");
CREATE INDEX IF NOT EXISTS "applications_companyId_score_idx" ON "applications"("companyId","autoScreenScore");

ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation ON "applications" USING ("companyId" = current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. interview_stages ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "interview_stages" (
  "id"             CHAR(26) PRIMARY KEY DEFAULT gen_ulid(),
  "companyId"      CHAR(26) NOT NULL,
  "applicationId"  CHAR(26) NOT NULL REFERENCES "applications"("id"),
  "roundNumber"    INT NOT NULL,
  "scheduledAt"    TIMESTAMP(3),
  "interviewerId"  CHAR(26),
  "outcome"        "InterviewOutcome" NOT NULL DEFAULT 'pending',
  "score"          INT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "interview_stages_app_round_key" ON "interview_stages"("applicationId","roundNumber");
CREATE INDEX IF NOT EXISTS "interview_stages_companyId_idx" ON "interview_stages"("companyId");

ALTER TABLE "interview_stages" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation ON "interview_stages" USING ("companyId" = current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 4. offer_letters ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "offer_letters" (
  "id"                 CHAR(26) PRIMARY KEY DEFAULT gen_ulid(),
  "companyId"          CHAR(26) NOT NULL,
  "applicationId"      CHAR(26) NOT NULL UNIQUE REFERENCES "applications"("id"),
  "proposedSalaryIqd"  DECIMAL(18,3) NOT NULL,
  "startDate"          DATE NOT NULL,
  "expiresAt"          TIMESTAMP(3) NOT NULL,
  "status"             "OfferLetterStatus" NOT NULL DEFAULT 'draft',
  "notes"              TEXT,
  "sentAt"             TIMESTAMP(3),
  "respondedAt"        TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  "createdBy"          CHAR(26) NOT NULL
);

CREATE INDEX IF NOT EXISTS "offer_letters_companyId_status_idx" ON "offer_letters"("companyId","status");

ALTER TABLE "offer_letters" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation ON "offer_letters" USING ("companyId" = current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;
