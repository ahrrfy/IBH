-- T49: Budget Module + Variance
-- Adds budgets + budget_lines for fiscal-year planning. Budgets never post
-- journal entries; the variance service compares BudgetLine.amount against
-- summed JournalEntryLine actuals per (accountCode, costCenter, period).
-- The lastAlertedThreshold column is used by the daily cron processor to
-- avoid re-emitting notifications while a line's utilization stays in the
-- same 80%/100%/120% band.

CREATE TABLE "budgets" (
    "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
    "companyId" CHAR(26) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "createdBy" CHAR(26) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budgets_status_check" CHECK ("status" IN ('draft','active','closed'))
);

CREATE INDEX "budgets_companyId_fiscalYear_idx"
    ON "budgets"("companyId", "fiscalYear");

CREATE TABLE "budget_lines" (
    "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
    "budgetId" CHAR(26) NOT NULL,
    "accountCode" VARCHAR(10) NOT NULL,
    "costCenterId" CHAR(26),
    "period" INTEGER NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,
    "lastAlertedThreshold" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_lines_period_check" CHECK ("period" BETWEEN 1 AND 12),
    CONSTRAINT "budget_lines_threshold_check"
        CHECK ("lastAlertedThreshold" IN (0,80,100,120))
);

-- Unique key — note: NULL costCenterId is treated as a wildcard slot,
-- so we use a partial index to make the (NULL,...) combo unique too.
CREATE UNIQUE INDEX "budget_lines_unique_with_cc"
    ON "budget_lines"("budgetId", "accountCode", "costCenterId", "period")
    WHERE "costCenterId" IS NOT NULL;

CREATE UNIQUE INDEX "budget_lines_unique_no_cc"
    ON "budget_lines"("budgetId", "accountCode", "period")
    WHERE "costCenterId" IS NULL;

CREATE INDEX "budget_lines_budgetId_period_idx"
    ON "budget_lines"("budgetId", "period");

ALTER TABLE "budget_lines"
    ADD CONSTRAINT "budget_lines_budgetId_fkey"
    FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE;

-- Enforce one active budget per (company, fiscalYear)
CREATE UNIQUE INDEX "budgets_one_active_per_year"
    ON "budgets"("companyId", "fiscalYear")
    WHERE "status" = 'active';
