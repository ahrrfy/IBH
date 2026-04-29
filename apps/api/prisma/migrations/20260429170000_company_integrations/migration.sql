-- Create IntegrationType enum
CREATE TYPE "IntegrationType" AS ENUM ('whatsapp', 'telegram', 'email_smtp', 'sms_provider');

-- Create company_integrations table
CREATE TABLE "company_integrations" (
    "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
    "companyId" CHAR(26) NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "configEncrypted" TEXT NOT NULL,
    "publicMetadata" JSONB NOT NULL DEFAULT '{}',
    "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastModifiedBy" CHAR(26) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_integrations_pkey" PRIMARY KEY ("id")
);

-- One row per (companyId, type)
CREATE UNIQUE INDEX "company_integrations_companyId_type_key"
  ON "company_integrations"("companyId", "type");

-- Index for "list enabled integrations for tenant"
CREATE INDEX "company_integrations_companyId_isEnabled_idx"
  ON "company_integrations"("companyId", "isEnabled");

-- RLS — same multi-tenant isolation as other companyId-scoped tables
ALTER TABLE "company_integrations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_integrations_company_isolation"
  ON "company_integrations"
  USING ("companyId" = current_company_id());
