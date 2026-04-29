import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';

@Injectable()
export class DashboardsService {
  constructor(private prisma: PrismaService) {}

  private startOfDay(d: Date = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  async executiveDashboard(companyId: string) {
    const today = this.startOfDay();
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(today);
    monthStart.setDate(1);
    const prevMonthStart = new Date(monthStart);
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
    const prevMonthEnd = new Date(monthStart);
    prevMonthEnd.setMilliseconds(-1);

    const sum = async (from: Date, to?: Date) => {
      const rows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT COALESCE(SUM("totalIqd"), 0)::float AS total
         FROM "sales_invoices" WHERE "companyId" = $1 AND "invoiceDate" >= $2
         ${to ? `AND "invoiceDate" <= $3` : ''}`,
        ...(to ? [companyId, from, to] : [companyId, from]),
      );
      return Number(rows?.[0]?.total ?? 0);
    };

    const [todaySales, weekSales, monthSales, prevMonthSales] = await Promise.all([
      sum(today),
      sum(weekStart),
      sum(monthStart),
      sum(prevMonthStart, prevMonthEnd),
    ]);

    const cashRows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(CASE WHEN "toAccountId" IS NOT NULL AND "fromAccountId" IS NULL THEN "amountIqd" WHEN "fromAccountId" IS NOT NULL AND "toAccountId" IS NULL THEN -"amountIqd" ELSE 0 END), 0)::float AS cash
       FROM "cash_movements" WHERE "companyId" = $1`,
      companyId,
    );

    const arRows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM("balanceIqd"), 0)::float AS total FROM "sales_invoices"
       WHERE "companyId" = $1 AND "balanceIqd" > 0`,
      companyId,
    );
    const apRows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM("balanceIqd"), 0)::float AS total FROM "vendor_invoices"
       WHERE "companyId" = $1 AND "balanceIqd" > 0`,
      companyId,
    );

    const topProducts: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT sil."variantId", p."nameAr" AS name, SUM(sil."qty")::float AS qty,
              SUM(sil."lineTotalIqd")::float AS revenue
       FROM "sales_invoice_lines" sil
       JOIN "sales_invoices" si ON si.id = sil."invoiceId"
       JOIN "product_variants" pv ON pv.id = sil."variantId"
       JOIN "product_templates" p ON p.id = pv."templateId"
       WHERE si."companyId" = $1 AND si."invoiceDate" >= $2
       GROUP BY sil."variantId", p."nameAr" ORDER BY revenue DESC LIMIT 5`,
      companyId,
      monthStart,
    );

    return {
      todaySales,
      weekSales,
      monthSales: {
        current: monthSales,
        previous: prevMonthSales,
        changePct: prevMonthSales > 0 ? (monthSales - prevMonthSales) / prevMonthSales : 0,
      },
      cashPosition: Number(cashRows?.[0]?.cash ?? 0),
      arTotal: Number(arRows?.[0]?.total ?? 0),
      apTotal: Number(apRows?.[0]?.total ?? 0),
      topProducts,
      recentActivities: [],
      alerts: [],
    };
  }

  async operationsDashboard(companyId: string, branchId?: string) {
    const today = this.startOfDay();

    // I047 — branchFilter rewritten as parameterized SQL (was vulnerable to
    // SQL injection via raw interpolation, plus broke when branchId was
    // empty string).
    const branchClause = branchId ? `AND "branchId" = $3` : '';
    const params = (extra?: any) => (branchId ? [companyId, today, branchId] : [companyId, today]);

    const receiptsRows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM("totalIqd"), 0)::float AS total
       FROM "sales_invoices" WHERE "companyId" = $1 AND "invoiceDate" >= $2 ${branchClause}`,
      ...(branchId ? [companyId, today, branchId] : [companyId, today]),
    );

    const activeShiftsRows: any[] = await this.prisma.$queryRawUnsafe(
      branchId
        ? `SELECT COUNT(*)::int AS count FROM "shifts" WHERE "companyId" = $1 AND "closedAt" IS NULL AND "branchId" = $2`
        : `SELECT COUNT(*)::int AS count FROM "shifts" WHERE "companyId" = $1 AND "closedAt" IS NULL`,
      ...(branchId ? [companyId, branchId] : [companyId]),
    );

    // I047 — `ProductVariant.reorderLevel` does not exist in schema. Low-
    // stock detection uses a fixed threshold of 10 units until per-variant
    // reorder levels are added in Wave 7. This avoids the 500 we were
    // serving on /dashboards/operations.
    const lowStockRows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM (
         SELECT pv.id FROM "product_variants" pv
         JOIN "product_templates" p ON p.id = pv."templateId"
         LEFT JOIN "inventory_balances" ib ON ib."variantId" = pv.id AND ib."companyId" = $1
         WHERE p."companyId" = $1 AND pv."isActive" = true
         GROUP BY pv.id
         HAVING COALESCE(SUM(ib."qtyOnHand"), 0) <= 10
       ) s`,
      companyId,
    );

    let pendingDeliveries = 0;
    let deliveryOnTimeRate = 0;
    try {
      const pd: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM "delivery_orders"
         WHERE "companyId" = $1 AND "status" IN ('pending_dispatch','in_transit','out_for_delivery')`,
        companyId,
      );
      pendingDeliveries = Number(pd?.[0]?.count ?? 0);
      // I047 — DeliveryOrder.scheduledAt does not exist; the schedule field
      // is plannedDate. Compare against deliveredAt to derive on-time %.
      const otr: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT
            SUM(CASE WHEN "deliveredAt" <= "plannedDate" THEN 1 ELSE 0 END)::float AS on_time,
            COUNT(*)::float AS total
         FROM "delivery_orders"
         WHERE "companyId" = $1 AND "status" = 'delivered'
           AND "plannedDate" IS NOT NULL
           AND "deliveredAt" >= NOW() - INTERVAL '30 days'`,
        companyId,
      );
      const total = Number(otr?.[0]?.total ?? 0);
      deliveryOnTimeRate = total > 0 ? Number(otr[0].on_time) / total : 0;
    } catch {}

    return {
      todayReceipts: {
        count: Number(receiptsRows?.[0]?.count ?? 0),
        total: Number(receiptsRows?.[0]?.total ?? 0),
      },
      activeShifts: Number(activeShiftsRows?.[0]?.count ?? 0),
      lowStockCount: Number(lowStockRows?.[0]?.count ?? 0),
      pendingDeliveries,
      deliveryOnTimeRate,
    };
  }

  async financeDashboard(companyId: string) {
    // I047 — wrap every raw query in its own try/catch + log so that a
    // single column-name bug doesn't return a 500 for the whole dashboard.
    // Each query tagged with its purpose; failures emit a structured warning
    // visible in container logs instead of bubbling up.
    const safeQuery = async <T = any>(label: string, sql: string, params: any[]): Promise<T[]> => {
      try {
        return (await this.prisma.$queryRawUnsafe(sql, ...params)) as T[];
      } catch (err) {
        console.warn(`[financeDashboard] ${label} failed:`, err instanceof Error ? err.message : err);
        return [];
      }
    };

    // BankAccount field is `type` (BankAccountType enum: checking/savings/cash).
    const cashRows = await safeQuery(
      'cashRows',
      `SELECT ba."type" AS kind,
              COALESCE(SUM(CASE WHEN cm."toAccountId" IS NOT NULL AND cm."fromAccountId" IS NULL THEN cm."amountIqd" WHEN cm."fromAccountId" IS NOT NULL AND cm."toAccountId" IS NULL THEN -cm."amountIqd" ELSE 0 END), 0)::float AS balance
       FROM "bank_accounts" ba
       LEFT JOIN "cash_movements" cm ON cm."bankAccountId" = ba.id
       WHERE ba."companyId" = $1 GROUP BY ba."type"`,
      [companyId],
    );

    const cashInBanks = cashRows.filter((r) => r.kind !== 'cash').reduce((s, r) => s + Number(r.balance), 0);
    const cashInHand = cashRows.filter((r) => r.kind === 'cash').reduce((s, r) => s + Number(r.balance), 0);

    const arAgingRows = await safeQuery(
      'arAgingRows',
      `SELECT
         COALESCE(SUM(CASE WHEN NOW() - "invoiceDate" <= INTERVAL '30 days' THEN "balanceIqd" ELSE 0 END), 0)::float AS bucket_0_30,
         COALESCE(SUM(CASE WHEN NOW() - "invoiceDate" > INTERVAL '30 days' AND NOW() - "invoiceDate" <= INTERVAL '90 days' THEN "balanceIqd" ELSE 0 END), 0)::float AS bucket_31_90,
         COALESCE(SUM(CASE WHEN NOW() - "invoiceDate" > INTERVAL '90 days' THEN "balanceIqd" ELSE 0 END), 0)::float AS bucket_90_plus
       FROM "sales_invoices" WHERE "companyId" = $1 AND "balanceIqd" > 0`,
      [companyId],
    );
    const apAgingRows = await safeQuery(
      'apAgingRows',
      `SELECT
         COALESCE(SUM(CASE WHEN NOW() - "invoiceDate" <= INTERVAL '30 days' THEN "balanceIqd" ELSE 0 END), 0)::float AS bucket_0_30,
         COALESCE(SUM(CASE WHEN NOW() - "invoiceDate" > INTERVAL '30 days' AND NOW() - "invoiceDate" <= INTERVAL '90 days' THEN "balanceIqd" ELSE 0 END), 0)::float AS bucket_31_90,
         COALESCE(SUM(CASE WHEN NOW() - "invoiceDate" > INTERVAL '90 days' THEN "balanceIqd" ELSE 0 END), 0)::float AS bucket_90_plus
       FROM "vendor_invoices" WHERE "companyId" = $1 AND "balanceIqd" > 0`,
      [companyId],
    );

    const recentJEs = await safeQuery(
      'recentJEs',
      `SELECT id, "entryDate", "description", "totalDebitIqd"::float AS total
       FROM "journal_entries" WHERE "companyId" = $1 ORDER BY "entryDate" DESC LIMIT 10`,
      [companyId],
    );

    // I047 — AccountingPeriod fields are `startDate`/`endDate`, not
    // `periodStart`/`periodEnd`. Was previously throwing into a silent
    // try/catch which masked the bug for months.
    const periodRows = await safeQuery(
      'periodStatus',
      `SELECT "status", "startDate", "endDate" FROM "accounting_periods"
       WHERE "companyId" = $1 ORDER BY "startDate" DESC LIMIT 1`,
      [companyId],
    );
    const periodStatus = periodRows[0] ?? { open: true };

    return {
      cashInBanks,
      cashInHand,
      arAging: arAgingRows[0] ?? { bucket_0_30: 0, bucket_31_90: 0, bucket_90_plus: 0 },
      apAging: apAgingRows[0] ?? { bucket_0_30: 0, bucket_31_90: 0, bucket_90_plus: 0 },
      recentJEs,
      periodStatus,
    };
  }

  async branchDashboard(companyId: string, branchId: string) {
    return this.operationsDashboard(companyId, branchId);
  }

  async hrDashboard(companyId: string) {
    const today = this.startOfDay();
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);

    let totalEmployees = 0;
    let presentToday = 0;
    let onLeaveToday = 0;
    let pendingLeaveRequests = 0;
    let upcomingBirthdays: any[] = [];
    let contractExpirations: any[] = [];

    try {
      const emp: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM "employees"
         WHERE "companyId" = $1 AND ("terminationDate" IS NULL OR "terminationDate" > NOW())`,
        companyId,
      );
      totalEmployees = Number(emp?.[0]?.count ?? 0);

      const att: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(DISTINCT "employeeId")::int AS count FROM "attendance_records"
         WHERE "companyId" = $1 AND "date" = $2 AND "checkIn" IS NOT NULL`,
        companyId,
        today,
      );
      presentToday = Number(att?.[0]?.count ?? 0);

      const leaves: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM "leave_requests"
         WHERE "companyId" = $1 AND "status" = 'approved' AND "startDate" <= $2 AND "endDate" >= $2`,
        companyId,
        today,
      );
      onLeaveToday = Number(leaves?.[0]?.count ?? 0);

      const pending: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM "leave_requests"
         WHERE "companyId" = $1 AND "status" = 'pending'`,
        companyId,
      );
      pendingLeaveRequests = Number(pending?.[0]?.count ?? 0);

      upcomingBirthdays = (await this.prisma.$queryRawUnsafe(
        `SELECT id, "nameAr", "dateOfBirth" FROM "employees"
         WHERE "companyId" = $1
           AND EXTRACT(MONTH FROM "dateOfBirth") = EXTRACT(MONTH FROM NOW())
         ORDER BY EXTRACT(DAY FROM "dateOfBirth") ASC LIMIT 10`,
        companyId,
      )) as any[];

      contractExpirations = (await this.prisma.$queryRawUnsafe(
        `SELECT id, "nameAr", "contractEndDate" FROM "employees"
         WHERE "companyId" = $1 AND "contractEndDate" BETWEEN $2 AND $3
         ORDER BY "contractEndDate" ASC`,
        companyId,
        today,
        in30,
      )) as any[];
    } catch {}

    return {
      totalEmployees,
      presentToday,
      onLeaveToday,
      pendingLeaveRequests,
      upcomingBirthdays,
      contractExpirations,
    };
  }
}
