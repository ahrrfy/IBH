-- ============================================================
-- WAVE 3 MIGRATION — Purchases (M06)
-- 3-Way Match: PO ←→ GRN ←→ VendorInvoice
-- ============================================================

CREATE TYPE "PurchaseOrderStatus"  AS ENUM ('draft','submitted','approved','partially_received','received','closed','cancelled');
CREATE TYPE "GRNStatus"            AS ENUM ('draft','quality_check','accepted','partially_accepted','rejected');
CREATE TYPE "VendorInvoiceStatus"  AS ENUM ('draft','matched','on_hold','posted','partially_paid','paid','cancelled','reversed');
CREATE TYPE "SupplierType"         AS ENUM ('local','international','freelance','service_provider');

-- ── SUPPLIERS ────────────────────────────────────────────────────────────────
CREATE TABLE "suppliers" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "code" VARCHAR(20) NOT NULL,
  "type" "SupplierType" NOT NULL DEFAULT 'local',
  "nameAr" VARCHAR(200) NOT NULL,
  "nameEn" VARCHAR(200),
  "contactPerson" VARCHAR(200),
  "phone" VARCHAR(20),
  "whatsapp" VARCHAR(20),
  "email" VARCHAR(200),
  "address" TEXT,
  "city" VARCHAR(100),
  "country" VARCHAR(3),
  "taxNumber" VARCHAR(50),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
  "paymentTermsDays" INT NOT NULL DEFAULT 0,
  "creditLimitIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "balanceIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "rating" DECIMAL(3,2),
  "onTimeDeliveryPct" DECIMAL(5,2),
  "qualityScorePct" DECIMAL(5,2),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  "updatedBy" CHAR(26) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "deletedBy" CHAR(26),
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "suppliers_company_code_uk" ON "suppliers"("companyId","code");
CREATE INDEX "suppliers_company_phone_ix" ON "suppliers"("companyId","phone");

ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "suppliers" USING ("companyId" = current_company_id());
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON "suppliers"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── SUPPLIER PRICES ─────────────────────────────────────────────────────────
CREATE TABLE "supplier_prices" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "supplierId" CHAR(26) NOT NULL,
  "variantId" CHAR(26) NOT NULL,
  "priceIqd" DECIMAL(18,3) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
  "priceOriginal" DECIMAL(18,3),
  "minQty" DECIMAL(18,3) NOT NULL DEFAULT 1,
  "leadTimeDays" INT NOT NULL DEFAULT 7,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "isPreferred" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "supplier_prices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_prices_supplier_fk" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
);
CREATE INDEX "supplier_prices_variant_ix" ON "supplier_prices"("variantId","effectiveFrom");
CREATE INDEX "supplier_prices_supplier_ix" ON "supplier_prices"("supplierId");

-- ── PURCHASE ORDERS ─────────────────────────────────────────────────────────
CREATE TABLE "purchase_orders" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "number" VARCHAR(50) NOT NULL,
  "supplierId" CHAR(26) NOT NULL,
  "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expectedDate" TIMESTAMP(3),
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
  "warehouseId" CHAR(26) NOT NULL,
  "subtotalIqd" DECIMAL(18,3) NOT NULL,
  "discountIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "taxIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "shippingIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "totalIqd" DECIMAL(18,3) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
  "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "paymentTerms" VARCHAR(100),
  "terms" TEXT,
  "notes" TEXT,
  "submittedAt" TIMESTAMP(3),
  "submittedBy" CHAR(26),
  "approvedAt" TIMESTAMP(3),
  "approvedBy" CHAR(26),
  "cancelledAt" TIMESTAMP(3),
  "cancelledBy" CHAR(26),
  "cancellationReason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  "updatedBy" CHAR(26) NOT NULL,
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_orders_supplier_fk" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
);
CREATE UNIQUE INDEX "purchase_orders_company_number_uk" ON "purchase_orders"("companyId","number");
CREATE INDEX "purchase_orders_company_supplier_ix" ON "purchase_orders"("companyId","supplierId");
CREATE INDEX "purchase_orders_company_status_ix" ON "purchase_orders"("companyId","status");
CREATE INDEX "purchase_orders_company_date_ix" ON "purchase_orders"("companyId","orderDate");

ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_orders" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_orders" USING ("companyId" = current_company_id());
CREATE TRIGGER purchase_orders_updated_at BEFORE UPDATE ON "purchase_orders"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE "purchase_order_lines" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "purchaseOrderId" CHAR(26) NOT NULL,
  "variantId" CHAR(26) NOT NULL,
  "qtyOrdered" DECIMAL(18,3) NOT NULL,
  "qtyReceived" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "qtyInvoiced" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "qtyRejected" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "unitCostIqd" DECIMAL(18,6) NOT NULL,
  "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "lineTotalIqd" DECIMAL(18,3) NOT NULL,
  "notes" VARCHAR(500),
  "sortOrder" INT NOT NULL DEFAULT 0,
  CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_order_lines_order_fk" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE
);
CREATE INDEX "purchase_order_lines_order_ix" ON "purchase_order_lines"("purchaseOrderId");
CREATE INDEX "purchase_order_lines_variant_ix" ON "purchase_order_lines"("variantId");

-- ── GOODS RECEIPT NOTES ─────────────────────────────────────────────────────
CREATE TABLE "goods_receipt_notes" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "number" VARCHAR(50) NOT NULL,
  "purchaseOrderId" CHAR(26) NOT NULL,
  "supplierId" CHAR(26) NOT NULL,
  "warehouseId" CHAR(26) NOT NULL,
  "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "GRNStatus" NOT NULL DEFAULT 'draft',
  "deliveryNoteRef" VARCHAR(50),
  "totalValueIqd" DECIMAL(18,3) NOT NULL,
  "qualityCheckedBy" CHAR(26),
  "qualityCheckedAt" TIMESTAMP(3),
  "qualityNotes" TEXT,
  "journalEntryId" CHAR(26),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "goods_receipt_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grn_po_fk" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id")
);
CREATE UNIQUE INDEX "grn_company_number_uk" ON "goods_receipt_notes"("companyId","number");
CREATE INDEX "grn_company_po_ix" ON "goods_receipt_notes"("companyId","purchaseOrderId");
CREATE INDEX "grn_company_date_ix" ON "goods_receipt_notes"("companyId","receiptDate");

ALTER TABLE "goods_receipt_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goods_receipt_notes" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "goods_receipt_notes" USING ("companyId" = current_company_id());
CREATE TRIGGER grn_updated_at BEFORE UPDATE ON "goods_receipt_notes"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE "grn_lines" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "grnId" CHAR(26) NOT NULL,
  "poLineId" CHAR(26),
  "variantId" CHAR(26) NOT NULL,
  "qtyReceived" DECIMAL(18,3) NOT NULL,
  "qtyAccepted" DECIMAL(18,3) NOT NULL,
  "qtyRejected" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "rejectionReason" VARCHAR(500),
  "unitCostIqd" DECIMAL(18,6) NOT NULL,
  "lineValueIqd" DECIMAL(18,3) NOT NULL,
  "batchNumber" VARCHAR(50),
  "expiryDate" TIMESTAMP(3),
  "sortOrder" INT NOT NULL DEFAULT 0,
  CONSTRAINT "grn_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grn_lines_grn_fk" FOREIGN KEY ("grnId") REFERENCES "goods_receipt_notes"("id") ON DELETE CASCADE,
  CONSTRAINT "grn_lines_qty_chk" CHECK ("qtyReceived" = "qtyAccepted" + "qtyRejected")
);
CREATE INDEX "grn_lines_grn_ix" ON "grn_lines"("grnId");
CREATE INDEX "grn_lines_variant_ix" ON "grn_lines"("variantId");

-- ── VENDOR INVOICES ─────────────────────────────────────────────────────────
CREATE TABLE "vendor_invoices" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "companyId" CHAR(26) NOT NULL,
  "branchId" CHAR(26) NOT NULL,
  "number" VARCHAR(50) NOT NULL,
  "vendorRef" VARCHAR(100) NOT NULL,
  "supplierId" CHAR(26) NOT NULL,
  "purchaseOrderId" CHAR(26),
  "invoiceDate" TIMESTAMP(3) NOT NULL,
  "dueDate" TIMESTAMP(3),
  "status" "VendorInvoiceStatus" NOT NULL DEFAULT 'draft',
  "subtotalIqd" DECIMAL(18,3) NOT NULL,
  "discountIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "taxIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "shippingIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "totalIqd" DECIMAL(18,3) NOT NULL,
  "paidIqd" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "balanceIqd" DECIMAL(18,3) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
  "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "matchStatus" VARCHAR(30),
  "matchDiscrepancy" TEXT,
  "attachmentUrl" TEXT,
  "ocrData" JSONB,
  "journalEntryId" CHAR(26),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  "updatedBy" CHAR(26) NOT NULL,
  "postedAt" TIMESTAMP(3),
  "postedBy" CHAR(26),
  CONSTRAINT "vendor_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vi_supplier_fk" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id"),
  CONSTRAINT "vi_po_fk" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id"),
  CONSTRAINT "vi_balance_chk" CHECK ("balanceIqd" = "totalIqd" - "paidIqd")
);
CREATE UNIQUE INDEX "vi_company_number_uk" ON "vendor_invoices"("companyId","number");
CREATE UNIQUE INDEX "vi_supplier_ref_uk" ON "vendor_invoices"("supplierId","vendorRef");
CREATE INDEX "vi_company_supplier_ix" ON "vendor_invoices"("companyId","supplierId");
CREATE INDEX "vi_company_status_ix" ON "vendor_invoices"("companyId","status");
CREATE INDEX "vi_company_due_ix" ON "vendor_invoices"("companyId","dueDate");

ALTER TABLE "vendor_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_invoices" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "vendor_invoices" USING ("companyId" = current_company_id());
CREATE TRIGGER vi_updated_at BEFORE UPDATE ON "vendor_invoices"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE "vendor_invoice_lines" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "invoiceId" CHAR(26) NOT NULL,
  "variantId" CHAR(26),
  "description" VARCHAR(500) NOT NULL,
  "qty" DECIMAL(18,3) NOT NULL,
  "unitCostIqd" DECIMAL(18,6) NOT NULL,
  "lineTotalIqd" DECIMAL(18,3) NOT NULL,
  "accountId" CHAR(26),
  "sortOrder" INT NOT NULL DEFAULT 0,
  CONSTRAINT "vi_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vi_lines_invoice_fk" FOREIGN KEY ("invoiceId") REFERENCES "vendor_invoices"("id") ON DELETE CASCADE
);
CREATE INDEX "vi_lines_invoice_ix" ON "vendor_invoice_lines"("invoiceId");

CREATE TABLE "vendor_invoice_payments" (
  "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
  "invoiceId" CHAR(26) NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amountIqd" DECIMAL(18,3) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "reference" VARCHAR(100),
  "cashAccountId" CHAR(26) NOT NULL,
  "notes" VARCHAR(500),
  "journalEntryId" CHAR(26),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" CHAR(26) NOT NULL,
  CONSTRAINT "vi_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vi_payments_invoice_fk" FOREIGN KEY ("invoiceId") REFERENCES "vendor_invoices"("id") ON DELETE CASCADE,
  CONSTRAINT "vi_payments_amount_chk" CHECK ("amountIqd" > 0)
);
CREATE INDEX "vi_payments_invoice_ix" ON "vendor_invoice_payments"("invoiceId");
CREATE INDEX "vi_payments_date_ix" ON "vendor_invoice_payments"("paymentDate");

COMMENT ON TABLE "vendor_invoices" IS '3-Way Match: PO + GRN + VendorInvoice. matchStatus tracks discrepancies.';
COMMENT ON CONSTRAINT "grn_lines_qty_chk" ON "grn_lines" IS 'Received = Accepted + Rejected';
