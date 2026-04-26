-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0009: fix update_updated_at() trigger function for camelCase columns
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Bug discovered by lead-to-customer e2e test (PR #36):
--
-- The original function (migration 0001) used `NEW.updated_at` (snake_case),
-- but Prisma generates camelCase columns (`"updatedAt"`). On UPDATE to any
-- table with an explicit trigger using this function (leads, bank_accounts,
-- fixed_assets, departments, employees, plus 12 more in waves 2/3), Postgres
-- raised:
--
--     record "new" has no field "updated_at"
--
-- Prisma surfaces this as P2022 ("The column `new` does not exist"), making
-- it look like a column issue when it's really a trigger pseudo-record issue.
--
-- The auto-applied trigger from the DO loop in 0001 was a no-op (it scanned
-- for `column_name = 'updated_at'` and Prisma never emits that), so this bug
-- only fired on tables that had an EXPLICIT `CREATE TRIGGER ... lead_updated_at`
-- etc — which is most Wave 4-6 tables.
--
-- Fix: change the function to set NEW."updatedAt". Drop the redundant DO loop
-- pre-creation as it never matched anything.
--
-- This is idempotent — CREATE OR REPLACE on the function. Existing triggers
-- continue to point at the same function name, so they pick up the new body
-- automatically.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
