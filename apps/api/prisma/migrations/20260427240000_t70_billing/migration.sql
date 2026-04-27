-- T70: Multi-tenant Billing Dashboard — Invoices & Payments (manual recording layer)
--
-- No real payment gateway is integrated. These tables surface what already
-- happens (subscription periods, T68 prorated charges) as invoices and let a
-- super-admin record manual payments, mark failed, retry, or void.
--
-- Additive only — does not alter any existing FK or column.

CREATE TABLE "license_invoices" (
    "id"              CHAR(26)        NOT NULL DEFAULT gen_ulid(),
    "companyId"       CHAR(26)        NOT NULL,
    "subscriptionId"  CHAR(26)        NOT NULL,
    "periodStart"     TIMESTAMP(3)    NOT NULL,
    "periodEnd"       TIMESTAMP(3)    NOT NULL,
    "amountIqd"       DECIMAL(18, 2)  NOT NULL,
    "status"          VARCHAR(20)     NOT NULL DEFAULT 'open',
    "dueDate"         TIMESTAMP(3),
    "paidAt"          TIMESTAMP(3),
    "paymentMethod"   VARCHAR(20)     NOT NULL DEFAULT 'pending',
    "paymentReference" VARCHAR(200),
    "notes"           TEXT,
    "createdAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"       CHAR(26),

    CONSTRAINT "license_invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "license_invoices_status_chk"
        CHECK ("status" IN ('open','paid','failed','voided')),
    CONSTRAINT "license_invoices_method_chk"
        CHECK ("paymentMethod" IN ('manual','wire','pending'))
);

-- One invoice per subscription per billing period (idempotency for the sweeper)
CREATE UNIQUE INDEX "license_invoices_subscription_period_key"
    ON "license_invoices"("subscriptionId", "periodStart", "periodEnd");

CREATE INDEX "license_invoices_company_status_idx"
    ON "license_invoices"("companyId", "status");

CREATE INDEX "license_invoices_status_idx"
    ON "license_invoices"("status");

CREATE INDEX "license_invoices_periodEnd_idx"
    ON "license_invoices"("periodEnd");

ALTER TABLE "license_invoices"
    ADD CONSTRAINT "license_invoices_subscription_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT;

CREATE TABLE "license_payments" (
    "id"          CHAR(26)        NOT NULL DEFAULT gen_ulid(),
    "invoiceId"   CHAR(26)        NOT NULL,
    "amountIqd"   DECIMAL(18, 2)  NOT NULL,
    "paidAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method"      VARCHAR(20)     NOT NULL DEFAULT 'manual',
    "reference"   VARCHAR(200),
    "recordedBy"  CHAR(26),
    "notes"       TEXT,
    "status"      VARCHAR(20)     NOT NULL DEFAULT 'recorded',
    "createdAt"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "license_payments_status_chk"
        CHECK ("status" IN ('recorded','reversed')),
    CONSTRAINT "license_payments_method_chk"
        CHECK ("method" IN ('manual','wire','pending'))
);

-- Idempotency on (invoice, reference): markPaid is safe to retry with the same
-- reference and will not double-record a payment.
CREATE UNIQUE INDEX "license_payments_invoice_reference_key"
    ON "license_payments"("invoiceId", "reference")
    WHERE "reference" IS NOT NULL;

CREATE INDEX "license_payments_invoice_idx"
    ON "license_payments"("invoiceId");

ALTER TABLE "license_payments"
    ADD CONSTRAINT "license_payments_invoice_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "license_invoices"("id") ON DELETE CASCADE;
