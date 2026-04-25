-- Wave 6 — CRM + Licensing
CREATE TYPE "LeadStatus" AS ENUM ('new','contacted','qualified','proposal','negotiation','won','lost');
CREATE TYPE "LicensePlan" AS ENUM ('trial','starter','business','enterprise');

-- ── LEADS ──
CREATE TABLE "leads" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "source" VARCHAR(50),
  "nameAr" VARCHAR(200) NOT NULL,
  "phone" VARCHAR(20),
  "email" VARCHAR(200),
  "interest" TEXT,
  "estimatedValueIqd" DECIMAL(18,3),
  "status" "LeadStatus" NOT NULL DEFAULT 'new',
  "score" INT NOT NULL DEFAULT 0,
  "assignedTo" CHAR(26),
  "customerId" CHAR(26),
  "wonAt" TIMESTAMP(3),
  "lostAt" TIMESTAMP(3),
  "lostReason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_score_chk" CHECK ("score" BETWEEN 0 AND 100)
);
CREATE INDEX "lead_company_status_ix" ON "leads"("companyId","status");
CREATE INDEX "lead_company_assigned_ix" ON "leads"("companyId","assignedTo");
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "leads" USING ("companyId" = current_company_id());
CREATE TRIGGER lead_updated_at BEFORE UPDATE ON "leads" FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE "lead_activities" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "leadId" CHAR(26) NOT NULL,
  "type" VARCHAR(30) NOT NULL,
  "subject" VARCHAR(200),
  "body" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "outcome" VARCHAR(100),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "la_lead_fk" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE
);
CREATE INDEX "la_lead_sched_ix" ON "lead_activities"("leadId","scheduledAt");

-- ── LICENSES (runs on LicenseServer, not tenant DB, but stored here for dev) ──
CREATE TABLE "licenses" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "licenseKey" VARCHAR(64) NOT NULL,
  "clientName" VARCHAR(200) NOT NULL,
  "clientContactEmail" VARCHAR(200),
  "plan" "LicensePlan" NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "activatedAt" TIMESTAMP(3),
  "maxCompanies" INT NOT NULL DEFAULT 1,
  "maxBranches" INT NOT NULL DEFAULT 1,
  "maxUsers" INT NOT NULL DEFAULT 5,
  "enabledModules" JSONB NOT NULL,
  "hardwareFingerprint" VARCHAR(200),
  "lastHeartbeatAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "revokedAt" TIMESTAMP(3),
  "revokedReason" TEXT,
  "signature" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "licenses_key_uk" ON "licenses"("licenseKey");
CREATE INDEX "licenses_client_ix" ON "licenses"("clientName");
