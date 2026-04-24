-- ============================================================
-- WAVE 2 MIGRATION — POS + Sales + Delivery
-- Philosophy: F2 (posting rules) + F3 (ledger integrity)
-- ============================================================

-- ── ENUMS ────────────────────────────────────────────────────────────────────
CREATE TYPE "PaymentMethod" AS ENUM (
  'cash','card','zaincash','fastpay','qi_card','fib',
  'bank_transfer','credit','store_credit','loyalty_points','mixed'
);
CREATE TYPE "QuotationStatus"   AS ENUM ('draft','sent','accepted','rejected','expired','converted');
CREATE TYPE "SalesOrderStatus"  AS ENUM ('draft','confirmed','partially_delivered','delivered','invoiced','closed','cancelled');
CREATE TYPE "InvoiceStatus"     AS ENUM ('draft','posted','partially_paid','paid','overdue','cancelled','reversed');
CREATE TYPE "ReturnReason"      AS ENUM ('defect','wrong_item','customer_request','quality_issue','damage_in_transit','other');
CREATE TYPE "ShiftStatus"       AS ENUM ('open','pending_close','closed','force_closed');
CREATE TYPE "ReceiptStatus"     AS ENUM ('completed','voided','held','refunded','partially_refunded');
CREATE TYPE "DeliveryStatus"    AS ENUM ('pending_dispatch','assigned','in_transit','delivered','failed','returned','cancelled');
CREATE TYPE "CustomerType"      AS ENUM ('walk_in','regular','vip','wholesale','corporate');

-- ── CUSTOMERS ────────────────────────────────────────────────────────────────
CREATE TABLE "customers" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "code" VARCHAR(20) NOT NULL,
  "type" "CustomerType" NOT NULL DEFAULT 'regular',
  "nameAr" VARCHAR(200) NOT NULL,
  "nameEn" VARCHAR(200),
  "phone" VARCHAR(20),
  "whatsapp" VARCHAR(20),
  "email" VARCHAR(200),
  "address" TEXT,
  "city" VARCHAR(100),
  "taxNumber" VARCHAR(50),
  "creditLimitIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "creditBalanceIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "loyaltyPoints" INT NOT NULL DEFAULT 0,
  "loyaltyTier" VARCHAR(20),
  "preferredPriceListId" CHAR(26),
  "defaultDiscountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "birthDate" DATE,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  "updatedBy" CHAR(26) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "deletedBy" CHAR(26),
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customers_company_code_uk" ON "customers"("companyId", "code");
CREATE INDEX "customers_company_phone_ix" ON "customers"("companyId", "phone");
CREATE INDEX "customers_company_whatsapp_ix" ON "customers"("companyId", "whatsapp");
CREATE INDEX "customers_company_name_trgm_ix" ON "customers" USING GIN ("nameAr" gin_trgm_ops);

ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "customers"
  USING ("companyId" = current_company_id());

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON "customers"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── QUOTATIONS ───────────────────────────────────────────────────────────────
CREATE TABLE "quotations" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "number" VARCHAR(50) NOT NULL,
  "customerId" CHAR(26) NOT NULL,
  "quotationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "status" "QuotationStatus" NOT NULL DEFAULT 'draft',
  "subtotalIqd" DECIMAL(18,3) NOT NULL,
  "discountIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "taxIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "totalIqd" DECIMAL(18,3) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
  "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "terms" TEXT,
  "notes" TEXT,
  "convertedToOrderId" CHAR(26),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  "updatedBy" CHAR(26) NOT NULL,
  CONSTRAINT "quotations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quotations_customer_fk" FOREIGN KEY ("customerId") REFERENCES "customers"("id")
);
CREATE UNIQUE INDEX "quotations_company_number_uk" ON "quotations"("companyId", "number");
CREATE INDEX "quotations_company_customer_ix" ON "quotations"("companyId","customerId");
CREATE INDEX "quotations_company_status_ix" ON "quotations"("companyId","status");

ALTER TABLE "quotations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quotations" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "quotations" USING ("companyId" = current_company_id());
CREATE TRIGGER quotations_updated_at BEFORE UPDATE ON "quotations"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE "quotation_lines" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "quotationId" CHAR(26) NOT NULL,
  "variantId" CHAR(26) NOT NULL,
  "qty" DECIMAL(18,3) NOT NULL,
  "unitPriceIqd" DECIMAL(18,3) NOT NULL,
  "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "discountIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "lineTotalIqd" DECIMAL(18,3) NOT NULL,
  "notes" VARCHAR(500),
  "sortOrder" INT NOT NULL DEFAULT 0,
  CONSTRAINT "quotation_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quotation_lines_quotation_fk" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE
);
CREATE INDEX "quotation_lines_quotation_ix" ON "quotation_lines"("quotationId");

-- ── SALES ORDERS ─────────────────────────────────────────────────────────────
CREATE TABLE "sales_orders" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "number" VARCHAR(50) NOT NULL,
  "customerId" CHAR(26) NOT NULL,
  "sourceQuotationId" CHAR(26),
  "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expectedDeliveryDate" TIMESTAMP(3),
  "status" "SalesOrderStatus" NOT NULL DEFAULT 'draft',
  "warehouseId" CHAR(26) NOT NULL,
  "subtotalIqd" DECIMAL(18,3) NOT NULL,
  "discountIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "taxIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "shippingIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "totalIqd" DECIMAL(18,3) NOT NULL,
  "depositIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
  "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "channel" VARCHAR(20) NOT NULL DEFAULT 'in_store',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  "updatedBy" CHAR(26) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "cancelledBy" CHAR(26),
  "cancellationReason" VARCHAR(500),
  CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_orders_customer_fk" FOREIGN KEY ("customerId") REFERENCES "customers"("id")
);
CREATE UNIQUE INDEX "sales_orders_company_number_uk" ON "sales_orders"("companyId","number");
CREATE INDEX "sales_orders_company_customer_ix" ON "sales_orders"("companyId","customerId");
CREATE INDEX "sales_orders_company_status_ix" ON "sales_orders"("companyId","status");
CREATE INDEX "sales_orders_company_date_ix" ON "sales_orders"("companyId","orderDate");

ALTER TABLE "sales_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_orders" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sales_orders" USING ("companyId" = current_company_id());
CREATE TRIGGER sales_orders_updated_at BEFORE UPDATE ON "sales_orders"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE "sales_order_lines" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "salesOrderId" CHAR(26) NOT NULL,
  "variantId" CHAR(26) NOT NULL,
  "qty" DECIMAL(18,3) NOT NULL,
  "qtyDelivered" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "qtyInvoiced" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "unitPriceIqd" DECIMAL(18,3) NOT NULL,
  "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "discountIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "lineTotalIqd" DECIMAL(18,3) NOT NULL,
  "notes" VARCHAR(500),
  "sortOrder" INT NOT NULL DEFAULT 0,
  CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_order_lines_order_fk" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE
);
CREATE INDEX "sales_order_lines_order_ix" ON "sales_order_lines"("salesOrderId");
CREATE INDEX "sales_order_lines_variant_ix" ON "sales_order_lines"("variantId");

-- ── SALES INVOICES ───────────────────────────────────────────────────────────
CREATE TABLE "sales_invoices" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "number" VARCHAR(50) NOT NULL,
  "customerId" CHAR(26) NOT NULL,
  "salesOrderId" CHAR(26),
  "shiftId" CHAR(26),
  "posReceiptId" CHAR(26),
  "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate" TIMESTAMP(3),
  "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
  "warehouseId" CHAR(26) NOT NULL,
  "subtotalIqd" DECIMAL(18,3) NOT NULL,
  "discountIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "taxIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "shippingIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "totalIqd" DECIMAL(18,3) NOT NULL,
  "paidIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "balanceIqd" DECIMAL(18,3) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
  "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "paymentTerms" VARCHAR(100),
  "journalEntryId" CHAR(26),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  "updatedBy" CHAR(26) NOT NULL,
  "postedAt" TIMESTAMP(3),
  "postedBy" CHAR(26),
  "reversedAt" TIMESTAMP(3),
  "reversedBy" CHAR(26),
  "reversalReason" VARCHAR(500),
  CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_invoices_customer_fk" FOREIGN KEY ("customerId") REFERENCES "customers"("id"),
  CONSTRAINT "sales_invoices_order_fk" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id"),
  CONSTRAINT "sales_invoices_balance_chk" CHECK ("balanceIqd" = "totalIqd" - "paidIqd")
);
CREATE UNIQUE INDEX "sales_invoices_company_number_uk" ON "sales_invoices"("companyId","number");
CREATE INDEX "sales_invoices_company_customer_ix" ON "sales_invoices"("companyId","customerId");
CREATE INDEX "sales_invoices_company_status_ix" ON "sales_invoices"("companyId","status");
CREATE INDEX "sales_invoices_company_date_ix" ON "sales_invoices"("companyId","invoiceDate");
CREATE INDEX "sales_invoices_company_due_ix" ON "sales_invoices"("companyId","dueDate");

ALTER TABLE "sales_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_invoices" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sales_invoices" USING ("companyId" = current_company_id());
CREATE TRIGGER sales_invoices_updated_at BEFORE UPDATE ON "sales_invoices"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE "sales_invoice_lines" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "invoiceId" CHAR(26) NOT NULL,
  "variantId" CHAR(26) NOT NULL,
  "qty" DECIMAL(18,3) NOT NULL,
  "unitPriceIqd" DECIMAL(18,3) NOT NULL,
  "unitCostIqd" DECIMAL(18,6) NOT NULL,
  "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "discountIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "lineTotalIqd" DECIMAL(18,3) NOT NULL,
  "cogsIqd" DECIMAL(18,3) NOT NULL,
  "notes" VARCHAR(500),
  "sortOrder" INT NOT NULL DEFAULT 0,
  CONSTRAINT "sales_invoice_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_invoice_lines_invoice_fk" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE CASCADE
);
CREATE INDEX "sales_invoice_lines_invoice_ix" ON "sales_invoice_lines"("invoiceId");
CREATE INDEX "sales_invoice_lines_variant_ix" ON "sales_invoice_lines"("variantId");

CREATE TABLE "sales_invoice_payments" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "invoiceId" CHAR(26) NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amountIqd" DECIMAL(18,3) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "reference" VARCHAR(100),
  "cashAccountId" CHAR(26) NOT NULL,
  "shiftId" CHAR(26),
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "sales_invoice_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_invoice_payments_invoice_fk" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE CASCADE,
  CONSTRAINT "sales_invoice_payments_amount_chk" CHECK ("amountIqd" > 0)
);
CREATE INDEX "sales_invoice_payments_invoice_ix" ON "sales_invoice_payments"("invoiceId");
CREATE INDEX "sales_invoice_payments_date_ix" ON "sales_invoice_payments"("paymentDate");

-- ── SALES RETURNS ────────────────────────────────────────────────────────────
CREATE TABLE "sales_returns" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "number" VARCHAR(50) NOT NULL,
  "originalInvoiceId" CHAR(26) NOT NULL,
  "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" "ReturnReason" NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'draft',
  "warehouseId" CHAR(26) NOT NULL,
  "subtotalIqd" DECIMAL(18,3) NOT NULL,
  "totalIqd" DECIMAL(18,3) NOT NULL,
  "refundMethod" "PaymentMethod" NOT NULL,
  "refundCashAccountId" CHAR(26),
  "journalEntryId" CHAR(26),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "approvedBy" CHAR(26),
  CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_returns_invoice_fk" FOREIGN KEY ("originalInvoiceId") REFERENCES "sales_invoices"("id")
);
CREATE UNIQUE INDEX "sales_returns_company_number_uk" ON "sales_returns"("companyId","number");
CREATE INDEX "sales_returns_invoice_ix" ON "sales_returns"("originalInvoiceId");
CREATE INDEX "sales_returns_company_date_ix" ON "sales_returns"("companyId","returnDate");

ALTER TABLE "sales_returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_returns" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sales_returns" USING ("companyId" = current_company_id());
CREATE TRIGGER sales_returns_updated_at BEFORE UPDATE ON "sales_returns"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE "sales_return_lines" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "returnId" CHAR(26) NOT NULL,
  "variantId" CHAR(26) NOT NULL,
  "qty" DECIMAL(18,3) NOT NULL,
  "unitPriceIqd" DECIMAL(18,3) NOT NULL,
  "unitCostIqd" DECIMAL(18,6) NOT NULL,
  "lineTotalIqd" DECIMAL(18,3) NOT NULL,
  "isRestockable" BOOLEAN NOT NULL DEFAULT true,
  "notes" VARCHAR(500),
  CONSTRAINT "sales_return_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_return_lines_return_fk" FOREIGN KEY ("returnId") REFERENCES "sales_returns"("id") ON DELETE CASCADE
);
CREATE INDEX "sales_return_lines_return_ix" ON "sales_return_lines"("returnId");

-- ── POS DEVICES ──────────────────────────────────────────────────────────────
CREATE TABLE "pos_devices" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "code" VARCHAR(20) NOT NULL,
  "nameAr" VARCHAR(100) NOT NULL,
  "cashAccountId" CHAR(26) NOT NULL,
  "cardAccountId" CHAR(26),
  "warehouseId" CHAR(26) NOT NULL,
  "printerName" VARCHAR(100),
  "hardwareFingerprint" VARCHAR(100),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "pos_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pos_devices_company_code_uk" ON "pos_devices"("companyId","code");
CREATE INDEX "pos_devices_company_branch_ix" ON "pos_devices"("companyId","branchId");

ALTER TABLE "pos_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_devices" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pos_devices" USING ("companyId" = current_company_id());
CREATE TRIGGER pos_devices_updated_at BEFORE UPDATE ON "pos_devices"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── SHIFTS ───────────────────────────────────────────────────────────────────
CREATE TABLE "shifts" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "posDeviceId" CHAR(26) NOT NULL,
  "cashierId" CHAR(26) NOT NULL,
  "shiftNumber" VARCHAR(50) NOT NULL,
  "openingCashIqd" DECIMAL(18,3) NOT NULL,
  "closingCashIqd" DECIMAL(18,3),
  "expectedCashIqd" DECIMAL(18,3),
  "cashDifferenceIqd" DECIMAL(18,3),
  "status" "ShiftStatus" NOT NULL DEFAULT 'open',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "closedBy" CHAR(26),
  "xReportsPrinted" INT NOT NULL DEFAULT 0,
  "zReportPrintedAt" TIMESTAMP(3),
  "managerApprovalBy" CHAR(26),
  "managerApprovalAt" TIMESTAMP(3),
  "handoverToShiftId" CHAR(26),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shifts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shifts_device_fk" FOREIGN KEY ("posDeviceId") REFERENCES "pos_devices"("id")
);
CREATE UNIQUE INDEX "shifts_company_number_uk" ON "shifts"("companyId","shiftNumber");
CREATE INDEX "shifts_company_cashier_ix" ON "shifts"("companyId","cashierId");
CREATE INDEX "shifts_company_status_ix" ON "shifts"("companyId","status");
CREATE INDEX "shifts_opened_ix" ON "shifts"("openedAt");

ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shifts" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "shifts" USING ("companyId" = current_company_id());

-- Partial unique: only ONE open shift per POS device
CREATE UNIQUE INDEX "shifts_one_open_per_device" ON "shifts"("posDeviceId")
  WHERE "status" = 'open';

CREATE TABLE "shift_cash_counts" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "shiftId" CHAR(26) NOT NULL,
  "phase" VARCHAR(20) NOT NULL,
  "denomination" INT NOT NULL,
  "count" INT NOT NULL,
  "subtotalIqd" DECIMAL(18,3) NOT NULL,
  "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "countedBy" CHAR(26) NOT NULL,
  CONSTRAINT "shift_cash_counts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shift_cash_counts_shift_fk" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE,
  CONSTRAINT "shift_cash_counts_phase_chk" CHECK ("phase" IN ('opening','closing'))
);
CREATE INDEX "shift_cash_counts_shift_ix" ON "shift_cash_counts"("shiftId","phase");

-- ── POS RECEIPTS ─────────────────────────────────────────────────────────────
CREATE TABLE "pos_receipts" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "shiftId" CHAR(26) NOT NULL,
  "number" VARCHAR(50) NOT NULL,
  "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "customerId" CHAR(26),
  "warehouseId" CHAR(26) NOT NULL,
  "status" "ReceiptStatus" NOT NULL DEFAULT 'completed',
  "subtotalIqd" DECIMAL(18,3) NOT NULL,
  "discountIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "taxIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "totalIqd" DECIMAL(18,3) NOT NULL,
  "changeGivenIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "loyaltyPointsEarned" INT NOT NULL DEFAULT 0,
  "loyaltyPointsUsed" INT NOT NULL DEFAULT 0,
  "journalEntryId" CHAR(26),
  "invoiceId" CHAR(26),
  "originalReceiptId" CHAR(26),
  "voidedAt" TIMESTAMP(3),
  "voidedBy" CHAR(26),
  "voidReason" VARCHAR(500),
  "clientUlid" VARCHAR(26),
  "syncedAt" TIMESTAMP(3),
  "isOffline" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "pos_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_receipts_shift_fk" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id")
);
CREATE UNIQUE INDEX "pos_receipts_company_number_uk" ON "pos_receipts"("companyId","number");
CREATE UNIQUE INDEX "pos_receipts_client_ulid_uk" ON "pos_receipts"("clientUlid") WHERE "clientUlid" IS NOT NULL;
CREATE INDEX "pos_receipts_shift_ix" ON "pos_receipts"("shiftId");
CREATE INDEX "pos_receipts_date_ix" ON "pos_receipts"("receiptDate");

ALTER TABLE "pos_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_receipts" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pos_receipts" USING ("companyId" = current_company_id());

CREATE TABLE "pos_receipt_lines" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "receiptId" CHAR(26) NOT NULL,
  "variantId" CHAR(26) NOT NULL,
  "qty" DECIMAL(18,3) NOT NULL,
  "unitPriceIqd" DECIMAL(18,3) NOT NULL,
  "unitCostIqd" DECIMAL(18,6) NOT NULL,
  "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "discountIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "lineTotalIqd" DECIMAL(18,3) NOT NULL,
  "cogsIqd" DECIMAL(18,3) NOT NULL,
  "sortOrder" INT NOT NULL DEFAULT 0,
  CONSTRAINT "pos_receipt_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_receipt_lines_receipt_fk" FOREIGN KEY ("receiptId") REFERENCES "pos_receipts"("id") ON DELETE CASCADE
);
CREATE INDEX "pos_receipt_lines_receipt_ix" ON "pos_receipt_lines"("receiptId");
CREATE INDEX "pos_receipt_lines_variant_ix" ON "pos_receipt_lines"("variantId");

CREATE TABLE "pos_receipt_payments" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "receiptId" CHAR(26) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "amountIqd" DECIMAL(18,3) NOT NULL,
  "reference" VARCHAR(100),
  "cashAccountId" CHAR(26) NOT NULL,
  CONSTRAINT "pos_receipt_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_receipt_payments_receipt_fk" FOREIGN KEY ("receiptId") REFERENCES "pos_receipts"("id") ON DELETE CASCADE,
  CONSTRAINT "pos_receipt_payments_amount_chk" CHECK ("amountIqd" >= 0)
);
CREATE INDEX "pos_receipt_payments_receipt_ix" ON "pos_receipt_payments"("receiptId");

-- ── CASH MOVEMENTS ───────────────────────────────────────────────────────────
CREATE TABLE "cash_movements" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "shiftId" CHAR(26),
  "fromAccountId" CHAR(26),
  "toAccountId" CHAR(26),
  "amountIqd" DECIMAL(18,3) NOT NULL,
  "movementType" VARCHAR(30) NOT NULL,
  "reference" VARCHAR(100),
  "notes" VARCHAR(500),
  "journalEntryId" CHAR(26),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_movements_shift_fk" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id"),
  CONSTRAINT "cash_movements_amount_chk" CHECK ("amountIqd" > 0)
);
CREATE INDEX "cash_movements_company_date_ix" ON "cash_movements"("companyId","createdAt");
CREATE INDEX "cash_movements_shift_ix" ON "cash_movements"("shiftId");

ALTER TABLE "cash_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_movements" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "cash_movements" USING ("companyId" = current_company_id());

-- ── DELIVERY ORDERS ──────────────────────────────────────────────────────────
CREATE TABLE "delivery_orders" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "number" VARCHAR(50) NOT NULL,
  "salesOrderId" CHAR(26),
  "invoiceId" CHAR(26),
  "customerId" CHAR(26) NOT NULL,
  "warehouseId" CHAR(26) NOT NULL,
  "driverId" CHAR(26),
  "status" "DeliveryStatus" NOT NULL DEFAULT 'pending_dispatch',
  "plannedDate" TIMESTAMP(3),
  "dispatchedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureReason" VARCHAR(500),
  "deliveryAddress" TEXT NOT NULL,
  "deliveryCity" VARCHAR(100),
  "deliveryLat" DECIMAL(10,7),
  "deliveryLng" DECIMAL(10,7),
  "contactPhone" VARCHAR(20),
  "shippingFeeIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "codAmountIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "codCollectedIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "codDepositedAt" TIMESTAMP(3),
  "codDepositJeId" CHAR(26),
  "proofImageUrl" TEXT,
  "proofSignatureUrl" TEXT,
  "proofOtpCode" VARCHAR(10),
  "customerRating" INT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_orders_order_fk" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id"),
  CONSTRAINT "delivery_orders_rating_chk" CHECK ("customerRating" IS NULL OR ("customerRating" BETWEEN 1 AND 5))
);
CREATE UNIQUE INDEX "delivery_orders_company_number_uk" ON "delivery_orders"("companyId","number");
CREATE INDEX "delivery_orders_company_status_ix" ON "delivery_orders"("companyId","status");
CREATE INDEX "delivery_orders_company_driver_ix" ON "delivery_orders"("companyId","driverId");
CREATE INDEX "delivery_orders_company_planned_ix" ON "delivery_orders"("companyId","plannedDate");

ALTER TABLE "delivery_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_orders" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "delivery_orders" USING ("companyId" = current_company_id());
CREATE TRIGGER delivery_orders_updated_at BEFORE UPDATE ON "delivery_orders"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE "delivery_status_logs" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "deliveryId" CHAR(26) NOT NULL,
  "fromStatus" "DeliveryStatus",
  "toStatus" "DeliveryStatus" NOT NULL,
  "lat" DECIMAL(10,7),
  "lng" DECIMAL(10,7),
  "notes" VARCHAR(500),
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changedBy" CHAR(26) NOT NULL,
  CONSTRAINT "delivery_status_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_status_logs_delivery_fk" FOREIGN KEY ("deliveryId") REFERENCES "delivery_orders"("id") ON DELETE CASCADE
);
CREATE INDEX "delivery_status_logs_delivery_ix" ON "delivery_status_logs"("deliveryId");

-- delivery_status_logs is append-only (status history)
CREATE TRIGGER delivery_status_logs_append_only BEFORE UPDATE OR DELETE ON "delivery_status_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_update_delete();

-- ── DOCUMENT SEQUENCES — seed rows for Wave 2 doc types ──────────────────────
-- (These are seeded via prisma/seed.ts, but safe to add defaults here if needed)

-- ── COMMENT ─────────────────────────────────────────────────────────────────
COMMENT ON TABLE "shifts"          IS 'POS cashier shifts — partial unique ensures one open shift per device';
COMMENT ON TABLE "pos_receipts"    IS 'POS sales receipts — clientUlid enables offline idempotency';
COMMENT ON TABLE "cash_movements"  IS 'All intra-shift cash movements (pickups, deposits, handovers)';
COMMENT ON TABLE "delivery_orders" IS 'Delivery orders — tracks COD collection separately from deposit';
