import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';

type Severity = 'info' | 'warning' | 'critical';

export interface Anomaly {
  type: string;
  severity: Severity;
  entityType: string;
  entityId: string;
  description: string;
  detectedAt: Date;
  data: Record<string, any>;
}

@Injectable()
export class AnomalyDetectionService {
  constructor(private prisma: PrismaService) {}

  async detectCashVarianceAnomalies(companyId: string): Promise<Anomaly[]> {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const shifts: any[] = await (this.prisma as any).shift?.findMany?.({
      where: { companyId, closedAt: { gte: sixtyDaysAgo, not: null } },
      select: { id: true, cashDifferenceIqd: true, closedAt: true, branchId: true },
    }) ?? [];

    if (shifts.length < 5) return [];
    const diffs = shifts.map((s) => Number(s.cashDifferenceIqd ?? 0));
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const variance = diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / diffs.length;
    const stddev = Math.sqrt(variance);
    if (stddev === 0) return [];

    return shifts
      .filter((s) => Math.abs(Number(s.cashDifferenceIqd ?? 0) - mean) > 2 * stddev)
      .map<Anomaly>((s) => ({
        type: 'cash_variance',
        severity: Math.abs(Number(s.cashDifferenceIqd) - mean) > 3 * stddev ? 'critical' : 'warning',
        entityType: 'Shift',
        entityId: s.id,
        description: `انحراف غير اعتيادي في صندوق الورديّة: ${s.cashDifferenceIqd} د.ع`,
        detectedAt: new Date(),
        data: { cashDifferenceIqd: s.cashDifferenceIqd, mean, stddev, branchId: s.branchId },
      }));
  }

  async detectUnusualReturns(companyId: string): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];
    try {
      const rows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT "customerId", COUNT(*)::int AS return_count
         FROM "SalesReturn" WHERE "companyId" = $1
         GROUP BY "customerId" HAVING COUNT(*) > 0`,
        companyId,
      );
      if (!rows || rows.length === 0) return [];
      const avg = rows.reduce((s, r) => s + Number(r.return_count), 0) / rows.length;
      for (const r of rows) {
        if (r.customerId && Number(r.return_count) >= 3 * avg && Number(r.return_count) >= 3) {
          anomalies.push({
            type: 'unusual_returns',
            severity: 'warning',
            entityType: 'Customer',
            entityId: r.customerId,
            description: `معدل إرجاع غير اعتيادي: ${r.return_count} مرتجعات`,
            detectedAt: new Date(),
            data: { returnCount: Number(r.return_count), avgReturnCount: avg },
          });
        }
      }
    } catch {
      return [];
    }
    return anomalies;
  }

  async detectPriceAnomalies(companyId: string): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const rows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT pil."variantId", pil."unitPriceIqd"::float AS price, pi."invoiceDate"
         FROM "PurchaseInvoiceLine" pil
         JOIN "PurchaseInvoice" pi ON pi.id = pil."purchaseInvoiceId"
         WHERE pi."companyId" = $1 AND pi."invoiceDate" >= $2
         ORDER BY pil."variantId", pi."invoiceDate" DESC`,
        companyId,
        ninetyDaysAgo,
      );
      const byVariant = new Map<string, number[]>();
      for (const r of rows) {
        const arr = byVariant.get(r.variantId) ?? [];
        arr.push(Number(r.price));
        byVariant.set(r.variantId, arr);
      }
      for (const [variantId, prices] of byVariant.entries()) {
        if (prices.length < 3) continue;
        const latest = prices[0];
        const rest = prices.slice(1);
        const avg = rest.reduce((a, b) => a + b, 0) / rest.length;
        if (avg > 0 && latest >= avg * 1.2) {
          anomalies.push({
            type: 'price_spike',
            severity: latest >= avg * 1.5 ? 'critical' : 'warning',
            entityType: 'ProductVariant',
            entityId: variantId,
            description: `سعر الشراء أعلى بنسبة ${Math.round(((latest / avg) - 1) * 100)}% عن المتوسط`,
            detectedAt: new Date(),
            data: { latestPrice: latest, avgPrice: avg },
          });
        }
      }
    } catch {
      return [];
    }
    return anomalies;
  }

  async detectLowStockRisk(companyId: string): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sales: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT sil."variantId", SUM(sil."qty")::float AS sold
         FROM "SalesInvoiceLine" sil
         JOIN "SalesInvoice" si ON si.id = sil."salesInvoiceId"
         WHERE si."companyId" = $1 AND si."invoiceDate" >= $2
         GROUP BY sil."variantId"`,
        companyId,
        thirtyDaysAgo,
      );
      const balances: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT "variantId", SUM("qtyOnHand")::float AS on_hand
         FROM "InventoryBalance" WHERE "companyId" = $1 GROUP BY "variantId"`,
        companyId,
      );
      const onHandMap = new Map(balances.map((b) => [b.variantId, Number(b.on_hand)]));

      for (const s of sales) {
        const dailyVelocity = Number(s.sold) / 30;
        if (dailyVelocity <= 0) continue;
        const onHand = onHandMap.get(s.variantId) ?? 0;
        const daysOfStock = onHand / dailyVelocity;
        if (daysOfStock < 7) {
          anomalies.push({
            type: 'low_stock_risk',
            severity: daysOfStock < 3 ? 'critical' : 'warning',
            entityType: 'ProductVariant',
            entityId: s.variantId,
            description: `المخزون يكفي ${daysOfStock.toFixed(1)} يوم فقط`,
            detectedAt: new Date(),
            data: { onHand, dailyVelocity, daysOfStock },
          });
        }
      }
    } catch {
      return [];
    }
    return anomalies;
  }

  async runAllChecks(companyId: string): Promise<Anomaly[]> {
    const results = await Promise.allSettled([
      this.detectCashVarianceAnomalies(companyId),
      this.detectUnusualReturns(companyId),
      this.detectPriceAnomalies(companyId),
      this.detectLowStockRisk(companyId),
    ]);
    const all: Anomaly[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }
    return all;
  }
}
