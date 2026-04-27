-- ─────────────────────────────────────────────────────────────────────────────
-- T44 — Customer 360 + RFM Segmentation
--
-- Adds RFM (Recency / Frequency / Monetary) columns to `customers` so the
-- nightly Bull job can persist segment labels (Champion / Loyal / At-Risk /
-- Lost / New) used by the Customer 360 detail view.
--
-- All columns are NULLABLE — existing rows remain valid until the first
-- recompute populates them.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "rfmRecencyDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "rfmFrequency"   INTEGER,
  ADD COLUMN IF NOT EXISTS "rfmMonetaryIqd" DECIMAL(18, 3),
  ADD COLUMN IF NOT EXISTS "rfmRScore"      INTEGER,
  ADD COLUMN IF NOT EXISTS "rfmFScore"      INTEGER,
  ADD COLUMN IF NOT EXISTS "rfmMScore"      INTEGER,
  ADD COLUMN IF NOT EXISTS "rfmSegment"     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "rfmComputedAt"  TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "customers_companyId_rfmSegment_idx"
  ON "customers" ("companyId", "rfmSegment");
