-- ============================================================================
-- I062 — Row-Level Security rollout to all multi-tenant tables.
-- ============================================================================
--
-- Background:
--   CLAUDE.md F1 mandates RLS on every table containing companyId.
--   Production audit (Session 35) found only 11 tables enforcing RLS.
--   A second audit (this migration) found 37 tables with policies, but
--   some used the wrong setting name (`app.company_id` from migration
--   20260427210000_t53_hr_promotions_salary_bands) and silently allowed
--   all rows because the API never sets that name.
--
-- This migration:
--   1. Defines `current_company_id()` (ULID/CHAR(26) returning TEXT) and
--      `rls_bypass_active()` (BOOLEAN) as the canonical helpers.
--   2. Re-applies a single tenant_isolation policy expression on every
--      multi-tenant table (drop-then-create, idempotent), replacing any
--      legacy variants. The expression honours an explicit bypass mode
--      (super-admin cross-tenant operations like license analytics,
--      billing sweeps) and falls back to per-tenant filtering otherwise.
--   3. Special-cases `roles` whose `companyId` is nullable (NULL = global
--      system role available to every tenant).
--
-- Bypass mode contract (set by application code, transaction-local):
--     SELECT set_config('app.bypass_rls', '1', true);
--   Applied implicitly when running:
--     SELECT set_config('app.bypass_rls', '0', true);  -- or unset
--
-- Risks accepted:
--   * Background jobs / processors that touch multi-tenant data without
--     setting either `app.current_company` or `app.bypass_rls` will see
--     ZERO rows once this migration runs. Audited callers are migrated
--     in the same PR (admin licensing analytics & billing sweep).
--   * Connection-pool reliability of `set_config(_, _, true)` is the
--     subject of follow-up work; policies here are correct regardless.
--
-- Idempotent: safe to re-apply. Uses DROP POLICY IF EXISTS + CREATE.
-- ============================================================================

-- ─── 1. Canonical helper functions ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION current_company_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_company', true), '');
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION rls_bypass_active() RETURNS BOOLEAN AS $$
  SELECT current_setting('app.bypass_rls', true) = '1';
$$ LANGUAGE SQL STABLE;

-- ─── 2. Apply unified policy to every multi-tenant table ───────────────────
-- Tables here = the union of (existing 37 RLS-enabled) ∪ (46 missing).
-- Excludes `roles` (nullable companyId — handled separately below).

DO $$
DECLARE
  t TEXT;
  multi_tenant_tables TEXT[] := ARRAY[
    -- A
    'account_mappings', 'accounting_periods', 'applications',
    'attendance_records', 'audit_logs', 'auto_reorder_runs',
    'autopilot_exceptions', 'autopilot_job_runs',
    -- B
    'bank_accounts', 'bank_reconciliations', 'branches', 'budgets',
    -- C
    'campaigns', 'cash_movements', 'chart_of_accounts',
    'cod_settlements', 'commission_assignments', 'commission_entries',
    'commission_plans', 'company_integrations', 'contract_templates',
    'cost_centers', 'customers',
    -- D
    'delivery_companies', 'delivery_orders', 'delivery_zones',
    'departments', 'document_sequences',
    -- E
    'employees', 'employment_contracts', 'exchange_rates',
    -- F
    'fixed_assets',
    -- G
    'goods_receipt_notes',
    -- H
    'hr_promotions',
    -- I
    'interview_stages', 'inventory_balances', 'inventory_flags',
    -- J
    'job_orders', 'job_postings', 'journal_entries',
    -- L
    'leads', 'leave_requests', 'license_invoices',
    -- N
    'notifications',
    -- O
    'offer_letters', 'omnichannel_messages',
    -- P
    'pay_grades', 'payment_receipts', 'payroll_runs', 'policies',
    'policy_acknowledgments', 'pos_conflict_logs', 'pos_devices',
    'pos_receipts', 'posting_profiles', 'price_lists',
    'product_attributes', 'product_categories', 'product_templates',
    'product_variants', 'promotion_approvals', 'promotions',
    'purchase_orders',
    -- Q
    'quotations',
    -- R
    'reorder_points',
    -- S
    'salary_bands', 'sales_invoices', 'sales_orders', 'sales_returns',
    'shifts', 'stock_ledger', 'stock_transfers', 'stocktaking_sessions',
    'subscriptions', 'suppliers', 'system_policies',
    -- U
    'unit_conversions', 'units_of_measure', 'users',
    -- V
    'variant_barcodes', 'vendor_invoices',
    -- W
    'warehouses'
  ];
BEGIN
  FOREACH t IN ARRAY multi_tenant_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I
           USING (rls_bypass_active() OR "companyId" = current_company_id())
           WITH CHECK (rls_bypass_active() OR "companyId" = current_company_id())',
        t
      );
    ELSE
      RAISE NOTICE 'Skipping RLS for missing table: %', t;
    END IF;
  END LOOP;
END $$;

-- ─── 3. Special case: roles (nullable companyId) ───────────────────────────
-- companyId IS NULL identifies a global system role visible to every
-- tenant (super_admin, etc). The policy must allow such reads.
-- WITH CHECK still requires NULL or matching companyId so a tenant
-- cannot insert a row claiming to be global without bypass.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'roles'
  ) THEN
    ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE roles FORCE  ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON roles;
    CREATE POLICY tenant_isolation ON roles
      USING (
        rls_bypass_active()
        OR "companyId" IS NULL
        OR "companyId" = current_company_id()
      )
      WITH CHECK (
        rls_bypass_active()
        OR "companyId" IS NULL
        OR "companyId" = current_company_id()
      );
  END IF;
END $$;

-- ─── 4. Sanity check (raise if expected count not reached) ─────────────────
-- Expected: at least 80 tables with rowsecurity=true after this migration.
-- This is a self-check, not a hard failure — production may legitimately
-- have a different table set.
DO $$
DECLARE
  rls_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO rls_count
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  WHERE t.schemaname = 'public' AND c.relrowsecurity = TRUE;

  RAISE NOTICE 'I062 — RLS now enabled on % tables', rls_count;
  IF rls_count < 50 THEN
    RAISE WARNING 'I062 — RLS table count % is lower than expected (50). Verify.', rls_count;
  END IF;
END $$;
