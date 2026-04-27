-- T71: Autonomous Operations Engine (الذكاء الخلفي)
-- Adds two append-only tables that back the AutopilotEngine:
--   * autopilot_exceptions — one row per situation that needs a manager decision
--   * autopilot_job_runs   — one row per cron/event execution, for observability
--
-- F4: rule-based (Tier 3). F2/F3: jobs NEVER bypass posting/stock-ledger
-- constraints; they delegate to existing services that already enforce
-- double-entry and append-only stock movements.

-- ─── Enums ──────────────────────────────────────────────────────────────────
CREATE TYPE "AutopilotSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TYPE "AutopilotExceptionStatus" AS ENUM ('pending', 'resolved', 'dismissed');

CREATE TYPE "AutopilotJobRunStatus" AS ENUM ('completed', 'exception_raised', 'no_op', 'failed');

-- ─── autopilot_exceptions ───────────────────────────────────────────────────
CREATE TABLE "autopilot_exceptions" (
    "id"              CHAR(26) NOT NULL DEFAULT gen_ulid(),
    "jobId"           VARCHAR(80) NOT NULL,
    "domain"          VARCHAR(40) NOT NULL,
    "companyId"       CHAR(26) NOT NULL,
    "severity"        "AutopilotSeverity" NOT NULL DEFAULT 'medium',
    "title"           VARCHAR(200) NOT NULL,
    "description"     VARCHAR(2000) NOT NULL,
    "payload"         JSONB NOT NULL DEFAULT '{}',
    "suggestedAction" VARCHAR(200),
    "status"          "AutopilotExceptionStatus" NOT NULL DEFAULT 'pending',
    "resolvedBy"      CHAR(26),
    "resolvedAt"      TIMESTAMP(3),
    "resolution"      JSONB,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autopilot_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "autopilot_exceptions_companyId_status_idx"
    ON "autopilot_exceptions"("companyId", "status");

CREATE INDEX "autopilot_exceptions_companyId_jobId_idx"
    ON "autopilot_exceptions"("companyId", "jobId");

CREATE INDEX "autopilot_exceptions_companyId_domain_status_idx"
    ON "autopilot_exceptions"("companyId", "domain", "status");

-- ─── autopilot_job_runs ─────────────────────────────────────────────────────
CREATE TABLE "autopilot_job_runs" (
    "id"               CHAR(26) NOT NULL DEFAULT gen_ulid(),
    "jobId"            VARCHAR(80) NOT NULL,
    "companyId"        CHAR(26) NOT NULL,
    "startedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"       TIMESTAMP(3),
    "status"           "AutopilotJobRunStatus" NOT NULL DEFAULT 'completed',
    "itemsProcessed"   INTEGER NOT NULL DEFAULT 0,
    "exceptionsRaised" INTEGER NOT NULL DEFAULT 0,
    "errorMessage"     VARCHAR(2000),

    CONSTRAINT "autopilot_job_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "autopilot_job_runs_companyId_jobId_startedAt_idx"
    ON "autopilot_job_runs"("companyId", "jobId", "startedAt");

CREATE INDEX "autopilot_job_runs_jobId_startedAt_idx"
    ON "autopilot_job_runs"("jobId", "startedAt");
