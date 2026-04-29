import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../platform/prisma/prisma.service';

@Injectable()
export class ForecastingService {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  private get brainUrl(): string | undefined {
    return this.config.get<string>('AI_BRAIN_URL');
  }

  private get apiKey(): string | undefined {
    return this.config.get<string>('AI_BRAIN_API_KEY');
  }

  async forecastSales(
    companyId: string,
    params: { variantId?: string; categoryId?: string; horizonDays?: number },
  ) {
    const horizon = params.horizonDays ?? 30;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    let historical: any[] = [];
    try {
      historical = (await this.prisma.$queryRawUnsafe(
        `SELECT DATE(si."invoiceDate") AS day, SUM(sil."qty")::float AS qty, SUM(sil."lineTotalIqd")::float AS revenue
         FROM "sales_invoice_lines" sil
         JOIN "sales_invoices" si ON si.id = sil."invoiceId"
         WHERE si."companyId" = $1 AND si."invoiceDate" >= $2
         ${params.variantId ? `AND sil."variantId" = $3` : ''}
         GROUP BY DATE(si."invoiceDate") ORDER BY day ASC`,
        ...(params.variantId
          ? [companyId, thirtyDaysAgo, params.variantId]
          : [companyId, thirtyDaysAgo]),
      )) as any[];
    } catch {
      historical = [];
    }

    if (this.brainUrl) {
      try {
        const res = await fetch(`${this.brainUrl}/forecast`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify({ companyId, historical, horizonDays: horizon, variantId: params.variantId }),
        });
        if (res.ok) {
          const data = (await res.json()) as Record<string, unknown>;
          return { available: true, source: 'ai_brain', ...data };
        }
      } catch {
        // fallthrough
      }
    }

    const qtys = historical.map((h) => Number(h.qty));
    const avgDaily = qtys.length > 0 ? qtys.reduce((a, b) => a + b, 0) / qtys.length : 0;
    const revs = historical.map((h) => Number(h.revenue));
    const avgDailyRevenue = revs.length > 0 ? revs.reduce((a, b) => a + b, 0) / revs.length : 0;

    const projection: { day: string; qty: number; revenue: number }[] = [];
    const today = new Date();
    for (let i = 1; i <= horizon; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      projection.push({ day: d.toISOString().slice(0, 10), qty: avgDaily, revenue: avgDailyRevenue });
    }

    return {
      available: true,
      source: 'moving_average',
      horizonDays: horizon,
      avgDailyQty: avgDaily,
      avgDailyRevenue,
      projection,
      historical,
    };
  }

  async forecastReorderPoint(variantId: string, companyId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let daily: number[] = [];
    try {
      const rows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT DATE(si."invoiceDate") AS day, SUM(sil."qty")::float AS qty
         FROM "sales_invoice_lines" sil
         JOIN "sales_invoices" si ON si.id = sil."invoiceId"
         WHERE si."companyId" = $1 AND sil."variantId" = $2 AND si."invoiceDate" >= $3
         GROUP BY DATE(si."invoiceDate")`,
        companyId,
        variantId,
        thirtyDaysAgo,
      );
      daily = rows.map((r) => Number(r.qty));
    } catch {
      daily = [];
    }

    const avgDailySales = daily.length > 0 ? daily.reduce((a, b) => a + b, 0) / 30 : 0;
    const variance =
      daily.length > 0 ? daily.reduce((a, b) => a + (b - avgDailySales) ** 2, 0) / daily.length : 0;
    const stddev = Math.sqrt(variance);
    const leadTimeDays = 7;
    const z = 1.65;
    const safetyStock = z * stddev * Math.sqrt(leadTimeDays);
    const suggestedReorderQty = Math.ceil(avgDailySales * leadTimeDays + safetyStock);

    let onHand = 0;
    try {
      const bal: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT SUM("qtyOnHand")::float AS on_hand FROM "inventory_balances"
         WHERE "companyId" = $1 AND "variantId" = $2`,
        companyId,
        variantId,
      );
      onHand = Number(bal?.[0]?.on_hand ?? 0);
    } catch {}

    const daysUntilStockout = avgDailySales > 0 ? onHand / avgDailySales : Infinity;
    const expectedStockoutDate = isFinite(daysUntilStockout)
      ? new Date(Date.now() + daysUntilStockout * 24 * 60 * 60 * 1000)
      : null;

    const confidence = Math.min(1, daily.length / 14);

    return {
      variantId,
      avgDailySales,
      stddev,
      leadTimeDays,
      safetyStock,
      suggestedReorderQty,
      onHand,
      expectedStockoutDate,
      confidence,
    };
  }

  async seasonalityDetection(companyId: string) {
    if (this.brainUrl) {
      try {
        const res = await fetch(`${this.brainUrl}/seasonality`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify({ companyId }),
        });
        if (res.ok) {
          const data = (await res.json()) as Record<string, unknown>;
          return { available: true, source: 'ai_brain', ...data };
        }
      } catch {}
    }
    return {
      available: false,
      message: 'تُفعَّل هذه الميزة عند تثبيت نموذج AI',
      topSeasonalCategories: [],
    };
  }
}
