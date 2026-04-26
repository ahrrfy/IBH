-- ─────────────────────────────────────────────────────────────────────────────
-- F2 (append-only) triggers — production has been silently missing all of
-- these for ~6 weeks because migration 0001 referenced 'stock_ledger_entries'
-- (plural) but Prisma's @@map renamed it to 'stock_ledger' (singular). The
-- IF EXISTS guard in 0001 saw the wrong name → skipped CREATE TRIGGER.
--
-- Verified missing on production (2026-04-26):
--   SELECT trigger_name FROM information_schema.triggers
--   WHERE trigger_name LIKE 'no_update%' → 0 rows.
--
-- This migration is idempotent (DROP IF EXISTS then CREATE). Safe to apply
-- to production — triggers only fire on UPDATE/DELETE, which the application
-- never does on these tables (verified by passing inventory-mwa + audit-
-- append-only e2e tests). So no behavior change for legitimate code, but
-- now data tampering at the DB level is impossible.
--
-- The function prevent_update_delete() should have been created by migration
-- 0001, but in production the original bootstrap was done via 'prisma db push'
-- (not migrate deploy) so the SQL inside the migration files never ran. We
-- re-create the function here idempotently so this migration is self-contained.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_update_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only. Updates and deletes are not permitted.',
    TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- audit_logs (immutable audit trail)
DROP TRIGGER IF EXISTS no_update_audit_logs ON audit_logs;
CREATE TRIGGER no_update_audit_logs
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_update_delete();

-- stock_ledger (immutable stock history) — table renamed via @@map, original
-- migration referenced wrong name, so trigger never installed.
DROP TRIGGER IF EXISTS no_update_stock_ledger ON stock_ledger;
CREATE TRIGGER no_update_stock_ledger
  BEFORE UPDATE OR DELETE ON stock_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_update_delete();

-- journal_entry_lines (accounting lines immutable after posting)
DROP TRIGGER IF EXISTS no_update_je_lines ON journal_entry_lines;
CREATE TRIGGER no_update_je_lines
  BEFORE UPDATE OR DELETE ON journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION prevent_update_delete();
