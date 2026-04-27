import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';

type GroupBy = 'day' | 'week' | 'month' | 'branch' | 'category';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async salesSummary(
    companyId: string,
    params: { from: Date; to: Date; groupBy?: GroupBy; branchId?: string },
  ) {
    const groupBy = params.groupBy ?? 'day';
    let dateExpr = `DATE(si."invoiceDate")`;
    if (groupBy === 'week') dateExpr = `DATE_TRUNC('week', si."invoiceDate")`;
    if (groupBy === 'month') dateExpr = `DATE_TRUNC('month', si."invoiceDate")`;

    if (groupBy === 'branch') {
      return this.prisma.$queryRawUnsafe(
        `SELECT si."branchId" AS bucket, COUNT(*)::int AS invoice_count,
                SUM(si."totalIqd")::float AS total_revenue
         FROM "sales_invoices" si
         WHERE si."companyId" = $1 AND si."invoiceDate" BETWEEN $2 AND $3
         ${params.branchId ? `AND si."branchId" = '${params.branchId}'` : ''}
         GROUP BY si."branchId" ORDER BY total_revenue DESC`,
        companyId,
        params.from,
        params.to,
      );
    }

    if (groupBy === 'category') {
      return this.prisma.$queryRawUnsafe(
        `SELECT p."categoryId" AS bucket, SUM(sil."qty")::float AS qty,
                SUM(sil."lineTotalIqd")::float AS total_revenue
         FROM "sales_invoice_lines" sil
         JOIN "sales_invoices" si ON si.id = sil."invoiceId"
         JOIN "product_variants" pv ON pv.id = sil."variantId"
         JOIN "product_templates" p ON p.id = pv."templateId"
         WHERE si."companyId" = $1 AND si."invoiceDate" BETWEEN $2 AND $3
         GROUP BY p."categoryId" ORDER BY total_revenue DESC`,
        companyId,
        params.from,
        params.to,
      );
    }

    return this.prisma.$queryRawUnsafe(
      `SELECT ${dateExpr} AS bucket, COUNT(*)::int AS invoice_count,
              SUM(si."totalIqd")::float AS total_revenue,
              SUM(si."totalTaxIqd")::float AS total_tax,
              SUM(si."discountIqd")::float AS total_discount
       FROM "sales_invoices" si
       WHERE si."companyId" = $1 AND si."invoiceDate" BETWEEN $2 AND $3
       ${params.branchId ? `AND si."branchId" = '${params.branchId}'` : ''}
       GROUP BY bucket ORDER BY bucket ASC`,
      companyId,
      params.from,
      params.to,
    );
  }

  /**
   * Sales by Product report (T38).
   * Ranks product variants by total sold (IQD) for the given period.
   * Source: sales_invoice_lines joined with sales_invoices and product templates.
   * F1: scoped by companyId (RLS upstream + explicit filter here).
   * F2: read-only aggregation, no journal mutation.
   * @param companyId tenant scope
   * @param params.from start of date range (inclusive)
   * @param params.to end of date range (inclusive)
   * @param params.limit max rows (default 20)
   * @param params.orderBy 'revenue' (default) or 'qty'
   * @returns rows of { productId, productName, totalSold, qtySold, invoiceCount, lastSaleDate }
   */
  async salesByProduct(
    companyId: string,
    params: { from: Date; to: Date; limit?: number; orderBy?: 'revenue' | 'qty' },
  ) {
    const orderCol = params.orderBy === 'qty' ? '"qtySold"' : '"totalSold"';
    const limit = params.limit ?? 20;
    return this.prisma.$queryRawUnsafe(
      `SELECT sil."variantId" AS "productId",
              p."nameAr" AS "productName",
              SUM(sil."lineTotalIqd")::float AS "totalSold",
              SUM(sil."qty")::float AS "qtySold",
              COUNT(DISTINCT sil."invoiceId")::int AS "invoiceCount",
              MAX(si."invoiceDate") AS "lastSaleDate"
       FROM "sales_invoice_lines" sil
       JOIN "sales_invoices" si ON si.id = sil."invoiceId"
       JOIN "product_variants" pv ON pv.id = sil."variantId"
       JOIN "product_templates" p ON p.id = pv."templateId"
       WHERE si."companyId" = $1 AND si."invoiceDate" BETWEEN $2 AND $3
       GROUP BY sil."variantId", p."nameAr"
       ORDER BY ${orderCol} DESC
       LIMIT ${limit}`,
      companyId,
      params.from,
      params.to,
    );
  }

  /**
   * Sales by Customer report (T38).
   * Ranks customers by total sales (IQD) for the given period.
   * Source: sales_invoices joined with customers — same pattern as topSuppliersReport.
   * F1: scoped by companyId (RLS upstream + explicit filter here).
   * F2: read-only aggregation, no journal mutation.
   * @param companyId tenant scope
   * @param params.from start of date range (inclusive)
   * @param params.to end of date range (inclusive)
   * @param params.limit max rows (default 20)
   * @returns rows of { customerId, customerName, totalSales, invoiceCount, lastInvoiceDate, avgInvoiceValue }
   */
  async salesByCustomer(companyId: string, params: { from: Date; to: Date; limit?: number }) {
    const limit = params.limit ?? 20;
    return this.prisma.$queryRawUnsafe(
      `SELECT si."customerId" AS "customerId",
              c."nameAr" AS "customerName",
              SUM(si."totalIqd")::float AS "totalSales",
              COUNT(*)::int AS "invoiceCount",
              MAX(si."invoiceDate") AS "lastInvoiceDate",
              AVG(si."totalIqd")::float AS "avgInvoiceValue"
       FROM "sales_invoices" si
       LEFT JOIN "customers" c ON c.id = si."customerId"
       WHERE si."companyId" = $1 AND si."invoiceDate" BETWEEN $2 AND $3
       GROUP BY si."customerId", c."nameAr"
       ORDER BY "totalSales" DESC
       LIMIT ${limit}`,
      companyId,
      params.from,
      params.to,
    );
  }

  async salesByCashier(companyId: string, params: { from: Date; to: Date }) {
    return this.prisma.$queryRawUnsafe(
      `SELECT si."createdBy" AS cashier_id, COUNT(*)::int AS invoice_count,
              SUM(si."totalIqd")::float AS revenue
       FROM "sales_invoices" si
       WHERE si."companyId" = $1 AND si."invoiceDate" BETWEEN $2 AND $3
       GROUP BY si."createdBy" ORDER BY revenue DESC`,
      companyId,
      params.from,
      params.to,
    );
  }

  async salesByPaymentMethod(companyId: string, params: { from: Date; to: Date }) {
    return this.prisma.$queryRawUnsafe(
      `SELECT sp."method" AS payment_method, COUNT(*)::int AS count,
              SUM(sp."amountIqd")::float AS total
       FROM "sales_invoice_payments" sp
       JOIN "sales_invoices" si ON si.id = sp."invoiceId"
       WHERE si."companyId" = $1 AND si."invoiceDate" BETWEEN $2 AND $3
       GROUP BY sp."method" ORDER BY total DESC`,
      companyId,
      params.from,
      params.to,
    );
  }

  async topProductsReport(companyId: string, params: { from: Date; to: Date; limit?: number }) {
    return this.salesByProduct(companyId, { ...params, orderBy: 'revenue', limit: params.limit ?? 20 });
  }

  async slowMovingProducts(companyId: string, params: { daysThreshold?: number }) {
    const days = params.daysThreshold ?? 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.$queryRawUnsafe(
      `SELECT pv.id AS "variantId", p."nameAr" AS product_name,
              SUM(ib."qtyOnHand")::float AS on_hand,
              MAX(si."invoiceDate") AS last_sold
       FROM "product_variants" pv
       JOIN "product_templates" p ON p.id = pv."templateId"
       LEFT JOIN "inventory_balances" ib ON ib."variantId" = pv.id AND ib."companyId" = $1
       LEFT JOIN "sales_invoice_lines" sil ON sil."variantId" = pv.id
       LEFT JOIN "sales_invoices" si ON si.id = sil."invoiceId" AND si."companyId" = $1
       WHERE p."companyId" = $1
       GROUP BY pv.id, p."nameAr"
       HAVING SUM(ib."qtyOnHand") > 0 AND (MAX(si."invoiceDate") < $2 OR MAX(si."invoiceDate") IS NULL)
       ORDER BY on_hand DESC`,
      companyId,
      cutoff,
    );
  }

  async lowStockReport(companyId: string) {
    return this.prisma.$queryRawUnsafe(
      `SELECT pv.id AS "variantId", p."nameAr" AS product_name,
              SUM(ib."qtyOnHand")::float AS on_hand,
              pv."reorderLevel"::float AS reorder_level
       FROM "product_variants" pv
       JOIN "product_templates" p ON p.id = pv."templateId"
       LEFT JOIN "inventory_balances" ib ON ib."variantId" = pv.id AND ib."companyId" = $1
       WHERE p."companyId" = $1
       GROUP BY pv.id, p."nameAr", pv."reorderLevel"
       HAVING SUM(ib."qtyOnHand") <= COALESCE(pv."reorderLevel", 0)
       ORDER BY on_hand ASC`,
      companyId,
    );
  }

  async stockValuationReport(companyId: string, asOf?: Date) {
    return this.prisma.$queryRawUnsafe(
      `SELECT pv.id AS "variantId", p."nameAr" AS product_name,
              SUM(ib."qtyOnHand")::float AS on_hand,
              AVG(ib."avgCostIqd")::float AS avg_cost,
              SUM(ib."qtyOnHand" * ib."avgCostIqd")::float AS total_value
       FROM "inventory_balances" ib
       JOIN "product_variants" pv ON pv.id = ib."variantId"
       JOIN "product_templates" p ON p.id = pv."templateId"
       WHERE ib."companyId" = $1
       GROUP BY pv.id, p."nameAr"
       ORDER BY total_value DESC`,
      companyId,
    );
  }

  async arAgingReport(companyId: string, asOf?: Date) {
    const date = asOf ?? new Date();
    return this.prisma.$queryRawUnsafe(
      `SELECT si."customerId", c."nameAr" AS customer_name,
              SUM(CASE WHEN $2 - si."invoiceDate" <= INTERVAL '30 days' THEN si."balanceIqd" ELSE 0 END)::float AS bucket_0_30,
              SUM(CASE WHEN $2 - si."invoiceDate" > INTERVAL '30 days' AND $2 - si."invoiceDate" <= INTERVAL '60 days' THEN si."balanceIqd" ELSE 0 END)::float AS bucket_31_60,
              SUM(CASE WHEN $2 - si."invoiceDate" > INTERVAL '60 days' AND $2 - si."invoiceDate" <= INTERVAL '90 days' THEN si."balanceIqd" ELSE 0 END)::float AS bucket_61_90,
              SUM(CASE WHEN $2 - si."invoiceDate" > INTERVAL '90 days' THEN si."balanceIqd" ELSE 0 END)::float AS bucket_90_plus,
              SUM(si."balanceIqd")::float AS total
       FROM "sales_invoices" si
       LEFT JOIN "customers" c ON c.id = si."customerId"
       WHERE si."companyId" = $1 AND si."balanceIqd" > 0
       GROUP BY si."customerId", c."nameAr"
       ORDER BY total DESC`,
      companyId,
      date,
    );
  }

  async apAgingReport(companyId: string, asOf?: Date) {
    const date = asOf ?? new Date();
    return this.prisma.$queryRawUnsafe(
      `SELECT pi."supplierId", s."nameAr" AS supplier_name,
              SUM(CASE WHEN $2 - pi."invoiceDate" <= INTERVAL '30 days' THEN pi."balanceIqd" ELSE 0 END)::float AS bucket_0_30,
              SUM(CASE WHEN $2 - pi."invoiceDate" > INTERVAL '30 days' AND $2 - pi."invoiceDate" <= INTERVAL '60 days' THEN pi."balanceIqd" ELSE 0 END)::float AS bucket_31_60,
              SUM(CASE WHEN $2 - pi."invoiceDate" > INTERVAL '60 days' AND $2 - pi."invoiceDate" <= INTERVAL '90 days' THEN pi."balanceIqd" ELSE 0 END)::float AS bucket_61_90,
              SUM(CASE WHEN $2 - pi."invoiceDate" > INTERVAL '90 days' THEN pi."balanceIqd" ELSE 0 END)::float AS bucket_90_plus,
              SUM(pi."balanceIqd")::float AS total
       FROM "vendor_invoices" pi
       LEFT JOIN "suppliers" s ON s.id = pi."supplierId"
       WHERE pi."companyId" = $1 AND pi."balanceIqd" > 0
       GROUP BY pi."supplierId", s."nameAr"
       ORDER BY total DESC`,
      companyId,
      date,
    );
  }

  /**
   * Top Suppliers report (T38).
   * Ranks suppliers by total purchases (IQD) for the given period.
   * Source: vendor_invoices joined with suppliers — same pattern as apAgingReport.
   * F1: scoped by companyId (RLS upstream + explicit filter here).
   * F2: read-only aggregation, no journal mutation.
   * @param companyId tenant scope
   * @param params.from start of date range (inclusive)
   * @param params.to end of date range (inclusive)
   * @param params.limit max rows (default 20)
   * @returns rows of { supplierId, supplierName, totalPurchases, invoiceCount, lastPurchaseDate }
   */
  async topSuppliersReport(
    companyId: string,
    params: { from: Date; to: Date; limit?: number },
  ) {
    const limit = params.limit ?? 20;
    return this.prisma.$queryRawUnsafe(
      `SELECT vi."supplierId" AS "supplierId",
              s."nameAr" AS "supplierName",
              SUM(vi."totalIqd")::float AS "totalPurchases",
              COUNT(*)::int AS "invoiceCount",
              MAX(vi."invoiceDate") AS "lastPurchaseDate"
       FROM "vendor_invoices" vi
       LEFT JOIN "suppliers" s ON s.id = vi."supplierId"
       WHERE vi."companyId" = $1 AND vi."invoiceDate" BETWEEN $2 AND $3
       GROUP BY vi."supplierId", s."nameAr"
       ORDER BY "totalPurchases" DESC
       LIMIT ${limit}`,
      companyId,
      params.from,
      params.to,
    );
  }

  /**
   * AR Aging report (T38 — slug `ar-aging`).
   * Buckets open customer invoices by days past `dueDate` as of a given date.
   * Mirrors `apAgingReport` logic exactly — same bucket boundaries, AR side.
   * Buckets:
   *   - current      → not yet due (dueDate >= asOf, or no dueDate)
   *   - days1to30    → 1..30 days past due
   *   - days31to60   → 31..60 days past due
   *   - days61to90   → 61..90 days past due
   *   - daysOver90   → > 90 days past due
   * Source: sales_invoices with positive balanceIqd, joined to customers.
   * F1: scoped by companyId. F2: read-only aggregation, no journal mutation.
   * @param companyId tenant scope
   * @param asOf cut-off date (defaults to now)
   * @returns rows of { customerId, customerName, current, days1to30, days31to60, days61to90, daysOver90, totalDue }
   */
  async arAging(companyId: string, asOf?: Date) {
    const date = asOf ?? new Date();
    return this.prisma.$queryRawUnsafe(
      `SELECT si."customerId" AS "customerId",
              c."nameAr" AS "customerName",
              SUM(CASE WHEN si."dueDate" IS NULL OR si."dueDate" >= $2::date THEN si."balanceIqd" ELSE 0 END)::float AS "current",
              SUM(CASE WHEN si."dueDate" < $2::date AND $2::date - si."dueDate" BETWEEN 1 AND 30 THEN si."balanceIqd" ELSE 0 END)::float AS "days1to30",
              SUM(CASE WHEN si."dueDate" < $2::date AND $2::date - si."dueDate" BETWEEN 31 AND 60 THEN si."balanceIqd" ELSE 0 END)::float AS "days31to60",
              SUM(CASE WHEN si."dueDate" < $2::date AND $2::date - si."dueDate" BETWEEN 61 AND 90 THEN si."balanceIqd" ELSE 0 END)::float AS "days61to90",
              SUM(CASE WHEN si."dueDate" < $2::date AND $2::date - si."dueDate" > 90 THEN si."balanceIqd" ELSE 0 END)::float AS "daysOver90",
              SUM(si."balanceIqd")::float AS "totalDue"
       FROM "sales_invoices" si
       LEFT JOIN "customers" c ON c.id = si."customerId"
       WHERE si."companyId" = $1 AND si."balanceIqd" > 0
       GROUP BY si."customerId", c."nameAr"
       ORDER BY "totalDue" DESC`,
      companyId,
      date,
    );
  }

  /**
   * Stock On Hand report (T38 — slug `stock-on-hand`).
   * Current inventory snapshot per variant per warehouse, ordered by valuation desc.
   * Source: inventory_balances (denormalized for speed) joined with stock_ledger
   * for the last movement date.
   * F1: scoped by companyId. F3: read-only — no ledger mutation.
   * @param companyId tenant scope
   * @param params.warehouseId optional warehouse filter
   * @returns rows of { variantId, productName, warehouseId, warehouseName, qtyOnHand, valuation, lastMovementDate }
   */
  async stockOnHand(companyId: string, params: { warehouseId?: string } = {}) {
    return this.prisma.$queryRawUnsafe(
      `SELECT ib."variantId" AS "variantId",
              p."nameAr" AS "productName",
              ib."warehouseId" AS "warehouseId",
              w."nameAr" AS "warehouseName",
              ib."qtyOnHand"::float AS "qtyOnHand",
              (ib."qtyOnHand" * ib."avgCostIqd")::float AS "valuation",
              (SELECT MAX(sl."createdAt") FROM "stock_ledger" sl
                 WHERE sl."companyId" = $1
                   AND sl."variantId" = ib."variantId"
                   AND sl."warehouseId" = ib."warehouseId") AS "lastMovementDate"
       FROM "inventory_balances" ib
       JOIN "product_variants" pv ON pv.id = ib."variantId"
       JOIN "product_templates" p ON p.id = pv."templateId"
       JOIN "warehouses" w ON w.id = ib."warehouseId"
       WHERE ib."companyId" = $1
       ${params.warehouseId ? `AND ib."warehouseId" = '${params.warehouseId}'` : ''}
       ORDER BY "valuation" DESC`,
      companyId,
    );
  }

  async customerLifetimeValue(companyId: string, customerId: string) {
    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS invoice_count,
              SUM(si."totalIqd")::float AS total_revenue,
              MIN(si."invoiceDate") AS first_purchase,
              MAX(si."invoiceDate") AS last_purchase,
              AVG(si."totalIqd")::float AS avg_invoice
       FROM "sales_invoices" si
       WHERE si."companyId" = $1 AND si."customerId" = $2`,
      companyId,
      customerId,
    );
    return rows?.[0] ?? { invoice_count: 0, total_revenue: 0 };
  }

  async giftProfitMargin(companyId: string, params: { from: Date; to: Date }) {
    return this.prisma.$queryRawUnsafe(
      `SELECT sil."variantId", p."nameAr" AS product_name,
              SUM(sil."qty")::float AS qty,
              SUM(sil."lineTotalIqd")::float AS revenue,
              SUM(sil."qty" * COALESCE(ib."avgCostIqd", 0))::float AS cost,
              SUM(sil."lineTotalIqd" - (sil."qty" * COALESCE(ib."avgCostIqd", 0)))::float AS profit
       FROM "sales_invoice_lines" sil
       JOIN "sales_invoices" si ON si.id = sil."invoiceId"
       JOIN "product_variants" pv ON pv.id = sil."variantId"
       JOIN "product_templates" p ON p.id = pv."templateId"
       LEFT JOIN "inventory_balances" ib ON ib."variantId" = pv.id AND ib."companyId" = $1
       WHERE si."companyId" = $1 AND si."invoiceDate" BETWEEN $2 AND $3
         AND p."isGiftware" = true
       GROUP BY sil."variantId", p."nameAr"
       ORDER BY profit DESC`,
      companyId,
      params.from,
      params.to,
    );
  }

  async cashMovementReport(companyId: string, params: { from: Date; to: Date; branchId?: string }) {
    return this.prisma.$queryRawUnsafe(
      `SELECT DATE(cm."movementDate") AS day, cm."direction" AS direction,
              SUM(cm."amountIqd")::float AS total
       FROM "cash_movements" cm
       WHERE cm."companyId" = $1 AND cm."movementDate" BETWEEN $2 AND $3
       ${params.branchId ? `AND cm."branchId" = '${params.branchId}'` : ''}
       GROUP BY DATE(cm."movementDate"), cm."direction"
       ORDER BY day ASC`,
      companyId,
      params.from,
      params.to,
    );
  }

  async shiftVarianceReport(companyId: string, params: { from: Date; to: Date; branchId?: string }) {
    return this.prisma.$queryRawUnsafe(
      `SELECT s.id AS "shiftId", s."branchId", s."openedAt", s."closedAt",
              s."expectedCashIqd"::float AS expected,
              s."actualCashIqd"::float AS actual,
              s."cashDifferenceIqd"::float AS variance
       FROM "shifts" s
       WHERE s."companyId" = $1 AND s."closedAt" BETWEEN $2 AND $3
       ${params.branchId ? `AND s."branchId" = '${params.branchId}'` : ''}
       ORDER BY ABS(s."cashDifferenceIqd") DESC`,
      companyId,
      params.from,
      params.to,
    );
  }

  async discountImpactReport(companyId: string, params: { from: Date; to: Date }) {
    return this.prisma.$queryRawUnsafe(
      `SELECT DATE(si."invoiceDate") AS day,
              COUNT(*)::int AS invoices,
              SUM(si."totalIqd")::float AS gross,
              SUM(si."discountIqd")::float AS discount,
              CASE WHEN SUM(si."totalIqd") > 0
                THEN (SUM(si."discountIqd") / SUM(si."totalIqd"))::float
                ELSE 0 END AS discount_rate
       FROM "sales_invoices" si
       WHERE si."companyId" = $1 AND si."invoiceDate" BETWEEN $2 AND $3
       GROUP BY DATE(si."invoiceDate") ORDER BY day ASC`,
      companyId,
      params.from,
      params.to,
    );
  }

  async returnsAnalysis(companyId: string, params: { from: Date; to: Date }) {
    return this.prisma.$queryRawUnsafe(
      `SELECT sr."reason", COUNT(*)::int AS count,
              SUM(sr."totalIqd")::float AS total_returned
       FROM "sales_returns" sr
       WHERE sr."companyId" = $1 AND sr."returnDate" BETWEEN $2 AND $3
       GROUP BY sr."reason" ORDER BY total_returned DESC`,
      companyId,
      params.from,
      params.to,
    );
  }

  async exportToCsv(reportName: string, params: any): Promise<string> {
    const method = (this as any)[reportName];
    if (typeof method !== 'function') {
      throw new BadRequestException({ code: 'REPORT_NOT_FOUND', messageAr: 'التقرير غير موجود' });
    }
    const rows: any[] = await method.call(this, params.companyId, params);
    if (!Array.isArray(rows) || rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const escape = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [headers.join(',')];
    for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(','));
    return lines.join('\n');
  }
}
