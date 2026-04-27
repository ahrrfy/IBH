-- ─────────────────────────────────────────────────────────────────────────────
-- HOTFIX: Restore RLS / helper functions that went missing on production
--
-- Symptom: 20260427183000_t51_hr_recruitment failed on production with:
--   ERROR: function current_company_id() does not exist
-- while applying:
--   CREATE POLICY tenant_isolation ON "job_postings"
--     USING ("companyId" = current_company_id())
--
-- These functions were originally created in 0001_initial. They are missing
-- on the production DB (likely dropped by a manual psql session, a partial
-- pg_restore, or a search_path issue). Recreating them with `CREATE OR
-- REPLACE` is fully idempotent — if they already exist with identical
-- bodies, this is a no-op; if dropped, they come back.
--
-- This migration is intentionally named to sort BEFORE the t51 migration
-- (…182500 < …183000) so Prisma applies it first on the next deploy.
-- ─────────────────────────────────────────────────────────────────────────────

-- ULID generator (used by gen_random_id() defaults across the schema).
CREATE OR REPLACE FUNCTION gen_ulid() RETURNS TEXT AS $$
DECLARE
  -- Crockford base32 alphabet (no I, L, O, U)
  alphabet TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  ts BIGINT;
  ts_part TEXT := '';
  rand_part TEXT := '';
  i INT;
  rand_byte INT;
BEGIN
  ts := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
  FOR i IN REVERSE 9..0 LOOP
    ts_part := ts_part || substr(alphabet, ((ts >> (i * 5)) & 31)::INT + 1, 1);
  END LOOP;
  FOR i IN 1..16 LOOP
    rand_byte := floor(random() * 32)::INT;
    rand_part := rand_part || substr(alphabet, rand_byte + 1, 1);
  END LOOP;
  RETURN ts_part || rand_part;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- RLS helper: returns the current request's company scope or NULL.
-- Set by the API per-request via `SET LOCAL app.current_company = '<ulid>'`.
-- ULID-based: companyId is CHAR(26), so this returns TEXT (not UUID).
CREATE OR REPLACE FUNCTION current_company_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_company', true), '');
$$ LANGUAGE SQL STABLE;

-- Append-only guard for AuditLog / StockLedgerEntry / journal_entries.
CREATE OR REPLACE FUNCTION prevent_update_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Append-only table: % cannot be modified or deleted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- Period-lock guard: refuses writes to journal_entries when the matching
-- accounting_period is closed. Used by triggers on financial tables.
CREATE OR REPLACE FUNCTION check_period_open()
RETURNS TRIGGER AS $$
DECLARE
  is_closed BOOLEAN;
BEGIN
  SELECT (status = 'closed') INTO is_closed
  FROM accounting_periods
  WHERE "companyId" = NEW."companyId"
    AND year = EXTRACT(YEAR FROM NEW."entryDate")::INT
    AND month = EXTRACT(MONTH FROM NEW."entryDate")::INT
  LIMIT 1;
  IF COALESCE(is_closed, false) THEN
    RAISE EXCEPTION 'Cannot write to closed accounting period';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updatedAt auto-touch trigger function.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
