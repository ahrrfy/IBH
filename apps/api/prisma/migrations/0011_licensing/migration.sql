-- ─────────────────────────────────────────────────────────────────────────────
-- T58 — Subscription & Licensing System (foundation for Wave 5: T59-T71)
--
-- Adds 6 new tables:
--   1. plans                  — subscription plan catalogue (Starter / Pro / Enterprise)
--   2. plan_features          — feature matrix per plan (one row per feature)
--   3. subscriptions          — per-tenant active subscription
--   4. subscription_features  — per-tenant feature override (temporary boost / sales unlock)
--   5. license_keys           — RSA-signed keys issued to a subscription
--   6. hardware_fingerprints  — device-bound key activation records (for Tauri POS/Desktop)
--   7. license_events         — append-only audit trail of all subscription state changes
--
-- Adds 3 enums:
--   - subscription_status     (pending | trial | active | grace | suspended | expired | cancelled)
--   - billing_cycle           (monthly | annual | bundle)
--   - license_event_type      (created | activated | trial_started | renewed | upgraded | …)
--
-- Coexists with the legacy `licenses` table (single-license model). The legacy
-- table stays for now; T66 (enforcement) will migrate any consumer code over.
--
-- Conventions:
--   - CHAR(26) ULID ids via gen_ulid()
--   - camelCase column names (matches existing schema)
--   - snake_case table names (Prisma @@map)
--   - All DDL is idempotent (IF NOT EXISTS / DO $$ … EXCEPTION WHEN duplicate_object)
-- ─────────────────────────────────────────────────────────────────────────────

-- enums --------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "subscription_status" AS ENUM
    ('pending', 'trial', 'active', 'grace', 'suspended', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "billing_cycle" AS ENUM ('monthly', 'annual', 'bundle');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "license_event_type" AS ENUM (
    'created', 'activated',
    'trial_started', 'trial_extended',
    'renewed', 'upgraded', 'downgraded',
    'suspended', 'resumed',
    'expired', 'cancelled', 'reinstated',
    'fingerprint_registered', 'fingerprint_revoked',
    'key_rotated',
    'payment_received', 'payment_failed',
    'feature_overridden'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- plans --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "plans" (
  "id"               CHAR(26)        NOT NULL DEFAULT gen_ulid(),
  "code"             VARCHAR(50)     NOT NULL,
  "name"             VARCHAR(200)    NOT NULL,
  "description"      TEXT,
  "monthlyPriceIqd"  DECIMAL(18, 2)  NOT NULL,
  "annualPriceIqd"   DECIMAL(18, 2)  NOT NULL,
  "maxUsers"         INTEGER,
  "maxBranches"      INTEGER,
  "maxCompanies"     INTEGER         DEFAULT 1,
  "featureSnapshot"  JSONB           NOT NULL DEFAULT '{}'::jsonb,
  "sortOrder"        INTEGER         NOT NULL DEFAULT 0,
  "isActive"         BOOLEAN         NOT NULL DEFAULT TRUE,
  "isPublic"         BOOLEAN         NOT NULL DEFAULT TRUE,
  "createdAt"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)    NOT NULL,
  CONSTRAINT "plans_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "plans_code_key"  UNIQUE ("code")
);

CREATE INDEX IF NOT EXISTS "plans_isActive_isPublic_sortOrder_idx"
  ON "plans" ("isActive", "isPublic", "sortOrder");

-- plan_features ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "plan_features" (
  "id"           CHAR(26)      NOT NULL DEFAULT gen_ulid(),
  "planId"       CHAR(26)      NOT NULL,
  "featureCode"  VARCHAR(100)  NOT NULL,
  "isEnabled"    BOOLEAN       NOT NULL DEFAULT TRUE,
  "limits"       JSONB,
  "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_features_pkey"                       PRIMARY KEY ("id"),
  CONSTRAINT "plan_features_planId_featureCode_key"     UNIQUE ("planId", "featureCode")
);

DO $$ BEGIN
  ALTER TABLE "plan_features"
    ADD CONSTRAINT "plan_features_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "plans" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "plan_features_featureCode_idx"
  ON "plan_features" ("featureCode");

-- subscriptions ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"                    CHAR(26)              NOT NULL DEFAULT gen_ulid(),
  "companyId"             CHAR(26)              NOT NULL,
  "planId"                CHAR(26)              NOT NULL,
  "status"                "subscription_status" NOT NULL DEFAULT 'pending',
  "billingCycle"          "billing_cycle"       NOT NULL DEFAULT 'monthly',
  "startedAt"             TIMESTAMP(3),
  "currentPeriodStartAt"  TIMESTAMP(3),
  "currentPeriodEndAt"    TIMESTAMP(3),
  "trialStartedAt"        TIMESTAMP(3),
  "trialEndsAt"           TIMESTAMP(3),
  "gracePeriodEndsAt"     TIMESTAMP(3),
  "cancelledAt"           TIMESTAMP(3),
  "cancellationReason"    TEXT,
  "priceIqd"              DECIMAL(18, 2)        NOT NULL DEFAULT 0,
  "resellerCode"          VARCHAR(50),
  "effectiveFeatures"     JSONB                 NOT NULL DEFAULT '{}'::jsonb,
  "notes"                 TEXT,
  "createdAt"             TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3)          NOT NULL,
  "createdBy"             CHAR(26),
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "plans" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "subscriptions_companyId_status_idx"
  ON "subscriptions" ("companyId", "status");
CREATE INDEX IF NOT EXISTS "subscriptions_currentPeriodEndAt_idx"
  ON "subscriptions" ("currentPeriodEndAt");
CREATE INDEX IF NOT EXISTS "subscriptions_gracePeriodEndsAt_idx"
  ON "subscriptions" ("gracePeriodEndsAt");
CREATE INDEX IF NOT EXISTS "subscriptions_trialEndsAt_idx"
  ON "subscriptions" ("trialEndsAt");

-- subscription_features ----------------------------------------------------

CREATE TABLE IF NOT EXISTS "subscription_features" (
  "id"              CHAR(26)      NOT NULL DEFAULT gen_ulid(),
  "subscriptionId"  CHAR(26)      NOT NULL,
  "featureCode"     VARCHAR(100)  NOT NULL,
  "isEnabled"       BOOLEAN       NOT NULL DEFAULT TRUE,
  "limits"          JSONB,
  "expiresAt"       TIMESTAMP(3),
  "reason"          TEXT,
  "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"       CHAR(26),
  CONSTRAINT "subscription_features_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_features_subId_code_key"
    UNIQUE ("subscriptionId", "featureCode")
);

DO $$ BEGIN
  ALTER TABLE "subscription_features"
    ADD CONSTRAINT "subscription_features_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "subscription_features_expiresAt_idx"
  ON "subscription_features" ("expiresAt");

-- license_keys -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "license_keys" (
  "id"              CHAR(26)      NOT NULL DEFAULT gen_ulid(),
  "subscriptionId"  CHAR(26)      NOT NULL,
  "key"             VARCHAR(512)  NOT NULL,
  "signatureSha"    VARCHAR(64)   NOT NULL,
  "issuedAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"       TIMESTAMP(3)  NOT NULL,
  "revokedAt"       TIMESTAMP(3),
  "revokedReason"   TEXT,
  "maxDevices"      INTEGER       NOT NULL DEFAULT 1,
  "lastSeenAt"      TIMESTAMP(3),
  "metadata"        JSONB         NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"       CHAR(26),
  CONSTRAINT "license_keys_pkey"     PRIMARY KEY ("id"),
  CONSTRAINT "license_keys_key_key"  UNIQUE ("key")
);

DO $$ BEGIN
  ALTER TABLE "license_keys"
    ADD CONSTRAINT "license_keys_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "license_keys_subscriptionId_idx"
  ON "license_keys" ("subscriptionId");
CREATE INDEX IF NOT EXISTS "license_keys_expiresAt_idx"
  ON "license_keys" ("expiresAt");

-- hardware_fingerprints ----------------------------------------------------

CREATE TABLE IF NOT EXISTS "hardware_fingerprints" (
  "id"               CHAR(26)      NOT NULL DEFAULT gen_ulid(),
  "licenseKeyId"     CHAR(26)      NOT NULL,
  "fingerprintHash"  VARCHAR(64)   NOT NULL,
  "deviceLabel"      VARCHAR(200),
  "os"               VARCHAR(50),
  "appVersion"       VARCHAR(50),
  "ipAddress"        VARCHAR(45),
  "firstSeenAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isActive"         BOOLEAN       NOT NULL DEFAULT TRUE,
  "revokedAt"        TIMESTAMP(3),
  "revokedReason"    TEXT,
  CONSTRAINT "hardware_fingerprints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hardware_fingerprints_keyId_hash_key"
    UNIQUE ("licenseKeyId", "fingerprintHash")
);

DO $$ BEGIN
  ALTER TABLE "hardware_fingerprints"
    ADD CONSTRAINT "hardware_fingerprints_licenseKeyId_fkey"
    FOREIGN KEY ("licenseKeyId") REFERENCES "license_keys" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "hardware_fingerprints_fingerprintHash_idx"
  ON "hardware_fingerprints" ("fingerprintHash");
CREATE INDEX IF NOT EXISTS "hardware_fingerprints_lastSeenAt_idx"
  ON "hardware_fingerprints" ("lastSeenAt");

-- license_events (append-only audit log) -----------------------------------

CREATE TABLE IF NOT EXISTS "license_events" (
  "id"              CHAR(26)              NOT NULL DEFAULT gen_ulid(),
  "subscriptionId"  CHAR(26)              NOT NULL,
  "eventType"       "license_event_type"  NOT NULL,
  "payload"         JSONB                 NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"       TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"       CHAR(26),
  CONSTRAINT "license_events_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "license_events"
    ADD CONSTRAINT "license_events_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "license_events_subscriptionId_createdAt_idx"
  ON "license_events" ("subscriptionId", "createdAt");
CREATE INDEX IF NOT EXISTS "license_events_eventType_createdAt_idx"
  ON "license_events" ("eventType", "createdAt");

-- Append-only enforcement: prevent UPDATE/DELETE on license_events.
-- (Same pattern as audit_logs / journal_entries / stock_ledger in 0008.)
CREATE OR REPLACE FUNCTION "trg_license_events_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'license_events is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "license_events_no_update" ON "license_events";
CREATE TRIGGER "license_events_no_update"
  BEFORE UPDATE OR DELETE ON "license_events"
  FOR EACH ROW EXECUTE FUNCTION "trg_license_events_append_only"();
