-- Wave 4 — Finance extensions + Fixed Assets
CREATE TYPE "BankAccountType" AS ENUM ('checking','savings','term_deposit','credit_line');
CREATE TYPE "BankReconciliationStatus" AS ENUM ('draft','in_progress','completed');
CREATE TYPE "DepreciationMethod" AS ENUM ('straight_line','declining_balance','units_of_production');
CREATE TYPE "AssetStatus" AS ENUM ('active','in_maintenance','disposed','sold','written_off');

-- ── BANK ACCOUNTS ──
CREATE TABLE "bank_accounts" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "accountId" CHAR(26) NOT NULL,
  "bankName" VARCHAR(100) NOT NULL,
  "branchName" VARCHAR(100),
  "accountNumber" VARCHAR(50) NOT NULL,
  "iban" VARCHAR(50),
  "swift" VARCHAR(20),
  "type" "BankAccountType" NOT NULL DEFAULT 'checking',
  "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
  "openingBalance" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "currentBalance" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "lastReconciledAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_accounts_company_num_uk" ON "bank_accounts"("companyId","accountNumber");
ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bank_accounts" USING ("companyId" = current_company_id());
CREATE TRIGGER bank_accounts_updated_at BEFORE UPDATE ON "bank_accounts" FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── BANK RECONCILIATION ──
CREATE TABLE "bank_reconciliations" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "bankAccountId" CHAR(26) NOT NULL,
  "statementDate" DATE NOT NULL,
  "statementBalance" DECIMAL(18,3) NOT NULL,
  "bookBalance" DECIMAL(18,3) NOT NULL,
  "adjustedBalance" DECIMAL(18,3) NOT NULL,
  "status" "BankReconciliationStatus" NOT NULL DEFAULT 'draft',
  "statementFileUrl" TEXT,
  "notes" TEXT,
  "reconciledAt" TIMESTAMP(3),
  "reconciledBy" CHAR(26),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "br_bank_fk" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id")
);
CREATE INDEX "br_company_bank_date_ix" ON "bank_reconciliations"("companyId","bankAccountId","statementDate");
ALTER TABLE "bank_reconciliations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_reconciliations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bank_reconciliations" USING ("companyId" = current_company_id());

CREATE TABLE "bank_reconciliation_items" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "reconciliationId" CHAR(26) NOT NULL,
  "journalEntryLineId" CHAR(26),
  "statementRef" VARCHAR(100),
  "description" VARCHAR(500) NOT NULL,
  "amountIqd" DECIMAL(18,3) NOT NULL,
  "direction" VARCHAR(10) NOT NULL,
  "matched" BOOLEAN NOT NULL DEFAULT false,
  "matchedAt" TIMESTAMP(3),
  "notes" TEXT,
  CONSTRAINT "br_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "br_items_recon_fk" FOREIGN KEY ("reconciliationId") REFERENCES "bank_reconciliations"("id") ON DELETE CASCADE,
  CONSTRAINT "br_items_direction_chk" CHECK ("direction" IN ('debit','credit'))
);
CREATE INDEX "br_items_recon_ix" ON "bank_reconciliation_items"("reconciliationId");

-- ── PAYMENT RECEIPTS (AR) ──
CREATE TABLE "payment_receipts" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "number" VARCHAR(50) NOT NULL,
  "customerId" CHAR(26) NOT NULL,
  "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amountIqd" DECIMAL(18,3) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "reference" VARCHAR(100),
  "cashAccountId" CHAR(26) NOT NULL,
  "appliedInvoices" JSONB,
  "unappliedAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "journalEntryId" CHAR(26),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pr_amount_chk" CHECK ("amountIqd" > 0)
);
CREATE UNIQUE INDEX "pr_company_number_uk" ON "payment_receipts"("companyId","number");
CREATE INDEX "pr_company_customer_ix" ON "payment_receipts"("companyId","customerId");
CREATE INDEX "pr_company_date_ix" ON "payment_receipts"("companyId","receiptDate");
ALTER TABLE "payment_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_receipts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payment_receipts" USING ("companyId" = current_company_id());

-- ── FIXED ASSETS ──
CREATE TABLE "fixed_assets" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "number" VARCHAR(50) NOT NULL,
  "nameAr" VARCHAR(200) NOT NULL,
  "nameEn" VARCHAR(200),
  "categoryAccountId" CHAR(26) NOT NULL,
  "accumDepAccountId" CHAR(26) NOT NULL,
  "depreciationExpenseAccountId" CHAR(26) NOT NULL,
  "costCenterId" CHAR(26),
  "acquisitionDate" DATE NOT NULL,
  "purchaseCostIqd" DECIMAL(18,3) NOT NULL,
  "salvageValueIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "usefulLifeMonths" INT NOT NULL,
  "depreciationMethod" "DepreciationMethod" NOT NULL DEFAULT 'straight_line',
  "monthlyDepIqd" DECIMAL(18,3) NOT NULL,
  "accumulatedDepIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "bookValueIqd" DECIMAL(18,3) NOT NULL,
  "serialNumber" VARCHAR(100),
  "vendorId" CHAR(26),
  "warrantyUntil" DATE,
  "location" TEXT,
  "assignedTo" CHAR(26),
  "status" "AssetStatus" NOT NULL DEFAULT 'active',
  "disposedAt" TIMESTAMP(3),
  "disposalMethod" VARCHAR(50),
  "disposalValueIqd" DECIMAL(18,3),
  "disposalGainLossIqd" DECIMAL(18,3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fa_useful_life_chk" CHECK ("usefulLifeMonths" > 0),
  CONSTRAINT "fa_salvage_chk" CHECK ("salvageValueIqd" <= "purchaseCostIqd")
);
CREATE UNIQUE INDEX "fa_company_number_uk" ON "fixed_assets"("companyId","number");
CREATE INDEX "fa_company_status_ix" ON "fixed_assets"("companyId","status");
CREATE INDEX "fa_company_category_ix" ON "fixed_assets"("companyId","categoryAccountId");
ALTER TABLE "fixed_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fixed_assets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "fixed_assets" USING ("companyId" = current_company_id());
CREATE TRIGGER fa_updated_at BEFORE UPDATE ON "fixed_assets" FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE "asset_depreciation" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "assetId" CHAR(26) NOT NULL,
  "periodYear" INT NOT NULL,
  "periodMonth" INT NOT NULL,
  "depreciationIqd" DECIMAL(18,3) NOT NULL,
  "accumulatedIqd" DECIMAL(18,3) NOT NULL,
  "bookValueIqd" DECIMAL(18,3) NOT NULL,
  "journalEntryId" CHAR(26),
  "postedAt" TIMESTAMP(3),
  "postedBy" CHAR(26),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_depreciation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ad_asset_fk" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id")
);
CREATE UNIQUE INDEX "ad_asset_period_uk" ON "asset_depreciation"("assetId","periodYear","periodMonth");
CREATE INDEX "ad_period_ix" ON "asset_depreciation"("periodYear","periodMonth");

CREATE TABLE "asset_maintenance" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "assetId" CHAR(26) NOT NULL,
  "date" DATE NOT NULL,
  "type" VARCHAR(50) NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "costIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "isCapital" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "asset_maintenance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "am_asset_fk" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE
);
CREATE INDEX "am_asset_date_ix" ON "asset_maintenance"("assetId","date");
