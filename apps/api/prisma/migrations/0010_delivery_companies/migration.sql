-- ─────────────────────────────────────────────────────────────────────────────
-- T32 — External Delivery Companies
--
-- Adds 4 new tables:
--   1. delivery_companies     — internal driver pool + 3rd-party couriers
--   2. delivery_zones         — geographic hierarchy (country/governorate/city/district)
--   3. delivery_company_rates — pricing matrix per (company × zone)
--   4. cod_settlements        — periodic COD batch reconciliation
--
-- Extends delivery_orders with:
--   - delivery_company_id, delivery_zone_id, assignment_reason
--   - external_waybill_no, external_status
--   - shipping_cost_iqd, commission_iqd (cached for fast settlement)
--   - cod_settlement_id (idempotency: a delivery is settled at most once)
--
-- Adds 2 enums:
--   - delivery_company_type (internal | external)
--   - cod_settlement_status (draft | proposed | posted | paid | cancelled)
--
-- All tables follow existing conventions:
--   - ULID Char(26) primary keys via gen_ulid()
--   - company_id for multi-tenant isolation (RLS to be added later)
--   - audit columns: created_at, updated_at, created_by, deleted_at
-- ─────────────────────────────────────────────────────────────────────────────

-- Enums --------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "DeliveryCompanyType" AS ENUM ('internal', 'external');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CodSettlementStatus" AS ENUM ('draft', 'proposed', 'posted', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- delivery_companies -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "delivery_companies" (
  "id"                   CHAR(26) PRIMARY KEY DEFAULT gen_ulid(),
  "companyId"            CHAR(26) NOT NULL,
  "code"                 VARCHAR(20) NOT NULL,
  "nameAr"               VARCHAR(200) NOT NULL,
  "nameEn"               VARCHAR(200),
  "type"                 "DeliveryCompanyType" NOT NULL DEFAULT 'external',
  "contactPerson"        VARCHAR(200),
  "phone"                VARCHAR(20),
  "whatsapp"             VARCHAR(20),
  "email"                VARCHAR(200),
  "address"              TEXT,
  "commissionPct"        DECIMAL(5, 2) NOT NULL DEFAULT 0,
  "flatFeePerOrderIqd"   DECIMAL(18, 3) NOT NULL DEFAULT 0,
  "supportsCod"          BOOLEAN NOT NULL DEFAULT TRUE,
  "codHoldingDays"       INT NOT NULL DEFAULT 7,
  "minOrderValueIqd"     DECIMAL(18, 3),
  "maxOrderValueIqd"     DECIMAL(18, 3),
  "totalDispatched"      INT NOT NULL DEFAULT 0,
  "totalDelivered"       INT NOT NULL DEFAULT 0,
  "totalFailed"          INT NOT NULL DEFAULT 0,
  "totalReturned"        INT NOT NULL DEFAULT 0,
  "successRatePct"       DECIMAL(5, 2) NOT NULL DEFAULT 0,
  "avgDeliveryHours"     DECIMAL(8, 2) NOT NULL DEFAULT 0,
  "lastScoredAt"         TIMESTAMP(3),
  "isActive"             BOOLEAN NOT NULL DEFAULT TRUE,
  "autoSuspendedAt"      TIMESTAMP(3),
  "autoSuspendReason"    VARCHAR(500),
  "notes"                TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  "createdBy"            CHAR(26) NOT NULL,
  "updatedBy"            CHAR(26) NOT NULL,
  "deletedAt"            TIMESTAMP(3),
  "deletedBy"            CHAR(26),
  CONSTRAINT "delivery_companies_companyId_code_key" UNIQUE ("companyId", "code")
);

CREATE INDEX IF NOT EXISTS "delivery_companies_companyId_isActive_type_idx"
  ON "delivery_companies" ("companyId", "isActive", "type");

-- delivery_zones -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "delivery_zones" (
  "id"          CHAR(26) PRIMARY KEY DEFAULT gen_ulid(),
  "companyId"   CHAR(26) NOT NULL,
  "code"        VARCHAR(40) NOT NULL,
  "nameAr"      VARCHAR(200) NOT NULL,
  "nameEn"      VARCHAR(200),
  "parentId"    CHAR(26),
  "level"       INT NOT NULL DEFAULT 0,
  "city"        VARCHAR(100),
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "createdBy"   CHAR(26) NOT NULL,
  "updatedBy"   CHAR(26) NOT NULL,
  CONSTRAINT "delivery_zones_companyId_code_key" UNIQUE ("companyId", "code"),
  CONSTRAINT "delivery_zones_parentId_fkey" FOREIGN KEY ("parentId")
    REFERENCES "delivery_zones" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "delivery_zones_companyId_city_idx"
  ON "delivery_zones" ("companyId", "city");
CREATE INDEX IF NOT EXISTS "delivery_zones_companyId_parentId_idx"
  ON "delivery_zones" ("companyId", "parentId");

-- delivery_company_rates ---------------------------------------------------
CREATE TABLE IF NOT EXISTS "delivery_company_rates" (
  "id"                CHAR(26) PRIMARY KEY DEFAULT gen_ulid(),
  "deliveryCompanyId" CHAR(26) NOT NULL,
  "deliveryZoneId"    CHAR(26) NOT NULL,
  "baseFeeIqd"        DECIMAL(18, 3) NOT NULL,
  "perKgIqd"          DECIMAL(18, 3) NOT NULL DEFAULT 0,
  "minFeeIqd"         DECIMAL(18, 3),
  "maxFeeIqd"         DECIMAL(18, 3),
  "estimatedHours"    INT NOT NULL DEFAULT 24,
  "isActive"          BOOLEAN NOT NULL DEFAULT TRUE,
  "validFrom"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil"        TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  "createdBy"         CHAR(26) NOT NULL,
  "updatedBy"         CHAR(26) NOT NULL,
  CONSTRAINT "delivery_company_rates_company_zone_key"
    UNIQUE ("deliveryCompanyId", "deliveryZoneId"),
  CONSTRAINT "delivery_company_rates_deliveryCompanyId_fkey"
    FOREIGN KEY ("deliveryCompanyId") REFERENCES "delivery_companies" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "delivery_company_rates_deliveryZoneId_fkey"
    FOREIGN KEY ("deliveryZoneId") REFERENCES "delivery_zones" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "delivery_company_rates_deliveryZoneId_isActive_idx"
  ON "delivery_company_rates" ("deliveryZoneId", "isActive");

-- cod_settlements ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "cod_settlements" (
  "id"                    CHAR(26) PRIMARY KEY DEFAULT gen_ulid(),
  "companyId"             CHAR(26) NOT NULL,
  "deliveryCompanyId"     CHAR(26) NOT NULL,
  "number"                VARCHAR(50) NOT NULL,
  "periodStart"           TIMESTAMP(3) NOT NULL,
  "periodEnd"             TIMESTAMP(3) NOT NULL,
  "totalCodCollectedIqd"  DECIMAL(18, 3) NOT NULL DEFAULT 0,
  "totalCommissionIqd"    DECIMAL(18, 3) NOT NULL DEFAULT 0,
  "totalShippingCostIqd"  DECIMAL(18, 3) NOT NULL DEFAULT 0,
  "netDueIqd"             DECIMAL(18, 3) NOT NULL DEFAULT 0,
  "deliveriesCount"       INT NOT NULL DEFAULT 0,
  "status"                "CodSettlementStatus" NOT NULL DEFAULT 'draft',
  "proposedJeId"          CHAR(26),
  "postedJeId"            CHAR(26),
  "approvedBy"            CHAR(26),
  "approvedAt"            TIMESTAMP(3),
  "paidAt"                TIMESTAMP(3),
  "paymentRef"            VARCHAR(100),
  "notes"                 TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  "createdBy"             CHAR(26) NOT NULL,
  CONSTRAINT "cod_settlements_companyId_number_key" UNIQUE ("companyId", "number"),
  CONSTRAINT "cod_settlements_company_period_key"
    UNIQUE ("deliveryCompanyId", "periodStart", "periodEnd"),
  CONSTRAINT "cod_settlements_deliveryCompanyId_fkey"
    FOREIGN KEY ("deliveryCompanyId") REFERENCES "delivery_companies" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "cod_settlements_companyId_status_idx"
  ON "cod_settlements" ("companyId", "status");
CREATE INDEX IF NOT EXISTS "cod_settlements_deliveryCompanyId_status_idx"
  ON "cod_settlements" ("deliveryCompanyId", "status");

-- delivery_orders extensions -----------------------------------------------
ALTER TABLE "delivery_orders"
  ADD COLUMN IF NOT EXISTS "deliveryCompanyId"  CHAR(26),
  ADD COLUMN IF NOT EXISTS "deliveryZoneId"     CHAR(26),
  ADD COLUMN IF NOT EXISTS "assignmentReason"   VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "externalWaybillNo"  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "externalStatus"     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "shippingCostIqd"    DECIMAL(18, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commissionIqd"      DECIMAL(18, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "codSettlementId"    CHAR(26);

DO $$ BEGIN
  ALTER TABLE "delivery_orders"
    ADD CONSTRAINT "delivery_orders_deliveryCompanyId_fkey"
    FOREIGN KEY ("deliveryCompanyId") REFERENCES "delivery_companies" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_orders"
    ADD CONSTRAINT "delivery_orders_deliveryZoneId_fkey"
    FOREIGN KEY ("deliveryZoneId") REFERENCES "delivery_zones" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_orders"
    ADD CONSTRAINT "delivery_orders_codSettlementId_fkey"
    FOREIGN KEY ("codSettlementId") REFERENCES "cod_settlements" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "delivery_orders_companyId_deliveryCompanyId_status_idx"
  ON "delivery_orders" ("companyId", "deliveryCompanyId", "status");
CREATE INDEX IF NOT EXISTS "delivery_orders_deliveryCompanyId_codSettlementId_idx"
  ON "delivery_orders" ("deliveryCompanyId", "codSettlementId");
