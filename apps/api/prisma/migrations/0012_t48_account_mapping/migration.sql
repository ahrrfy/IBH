-- T48: Financial Accounts Configurator
-- Adds account_mappings: per-(company, eventType) GL code mapping that
-- replaces hardcoded literals in posting code paths. The accountCode column
-- is a soft FK to chart_of_accounts.code (validated in the service layer
-- because (companyId, code) is the natural key on chart_of_accounts and a
-- direct multi-column FK adds little safety beyond the service check).

CREATE TABLE "account_mappings" (
    "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
    "companyId" CHAR(26) NOT NULL,
    "eventType" VARCHAR(80) NOT NULL,
    "accountCode" VARCHAR(10) NOT NULL,
    "description" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_mappings_companyId_eventType_key"
    ON "account_mappings"("companyId", "eventType");

CREATE INDEX "account_mappings_companyId_idx"
    ON "account_mappings"("companyId");
