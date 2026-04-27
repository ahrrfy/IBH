-- T55 — E-commerce ↔ ERP order integration.
-- Adds payment + public tracking columns on sales_orders so we can drive
-- post-creation lifecycle (gateway selection, webhook reconciliation, guest
-- tracking page) without coupling any of those concerns to the existing
-- ERP-internal SO flow. All columns are nullable: rows created before T55
-- and rows from in-store / phone channels keep working unchanged.

ALTER TABLE "sales_orders"
  ADD COLUMN "paymentMethod"    VARCHAR(20),
  ADD COLUMN "paymentReference" VARCHAR(100),
  ADD COLUMN "paymentStatus"    VARCHAR(20),
  ADD COLUMN "trackingId"       VARCHAR(40);

-- Whitelist payment values (CHECK over VARCHAR per project policy: no PG ENUMs).
ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_paymentMethod_check"
  CHECK ("paymentMethod" IS NULL OR "paymentMethod" IN ('cod', 'zaincash', 'fastpay', 'qi_card'));

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_paymentStatus_check"
  CHECK ("paymentStatus" IS NULL OR "paymentStatus" IN ('pending', 'paid', 'refunded', 'failed'));

-- The tracking token is the only handle a guest customer has for their order;
-- it must be unique and cheaply lookupable from the public status endpoint.
CREATE UNIQUE INDEX "sales_orders_trackingId_key" ON "sales_orders"("trackingId");
