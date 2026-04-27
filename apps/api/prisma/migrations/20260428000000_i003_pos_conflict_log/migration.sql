-- I003: POS Offline Sync Conflict Log
--
-- Strategy: Last-Write-Wins + conflict log for manager review.
-- The POS receipt is ALWAYS posted (business continuity — cashier already
-- gave the product). This table records the divergence so a manager can
-- review and take corrective action (re-price, adjust stock, etc.).
--
-- Conflict types:
--   price_mismatch     — POS price differs from server by > 5%
--   insufficient_stock — server stock < POS qty at sync time
--   product_inactive   — product/variant marked inactive server-side
--
-- Resolution lifecycle:
--   auto_accepted      — within tolerance, logged for audit only
--   pending_review     — above tolerance, awaiting manager
--   manager_accepted   — manager reviewed and accepted POS value
--   manager_rejected   — manager reviewed and rejected (manual correction needed)
--
-- Append-only (F2 spirit): no UPDATE/DELETE triggers applied below.
-- Conflict logs represent an immutable audit of what happened during sync.

CREATE TABLE "pos_conflict_logs" (
    "id"           CHAR(26)     NOT NULL DEFAULT gen_ulid(),
    "companyId"    CHAR(26)     NOT NULL,
    "branchId"     CHAR(26)     NOT NULL,
    "receiptId"    CHAR(26)     NOT NULL,
    "clientUlid"   VARCHAR(26),
    "conflictType" VARCHAR(50)  NOT NULL,
    "variantId"    CHAR(26),
    "posValue"     VARCHAR(200) NOT NULL,
    "serverValue"  VARCHAR(200) NOT NULL,
    "resolution"   VARCHAR(30)  NOT NULL DEFAULT 'pending_review',
    "notes"        VARCHAR(500),
    "resolvedBy"   CHAR(26),
    "resolvedAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_conflict_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_conflict_logs_type_chk"
        CHECK ("conflictType" IN ('price_mismatch', 'insufficient_stock', 'product_inactive')),
    CONSTRAINT "pos_conflict_logs_resolution_chk"
        CHECK ("resolution" IN ('auto_accepted', 'pending_review', 'manager_accepted', 'manager_rejected')),
    CONSTRAINT "pos_conflict_logs_receipt_fkey"
        FOREIGN KEY ("receiptId") REFERENCES "pos_receipts"("id")
);

CREATE INDEX "pos_conflict_logs_company_resolution_idx"
    ON "pos_conflict_logs" ("companyId", "resolution", "createdAt");

CREATE INDEX "pos_conflict_logs_receipt_idx"
    ON "pos_conflict_logs" ("receiptId");

-- ── RLS: company-scoped (managers see only their company's conflicts) ─────────
ALTER TABLE "pos_conflict_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_conflict_logs" FORCE ROW LEVEL SECURITY;

-- Company isolation policy (same pattern as all other tenant tables)
CREATE POLICY "pos_conflict_logs_company_isolation"
    ON "pos_conflict_logs"
    FOR ALL
    USING (
        "companyId" = current_company_id()
        OR current_company_id() = '*'
    );
