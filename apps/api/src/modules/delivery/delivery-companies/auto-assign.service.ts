import { Injectable } from '@nestjs/common';
import { Prisma, DeliveryCompanyType } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';

export type AutoAssignContext = {
  companyId: string;
  deliveryCity?: string | null;
  deliveryZoneId?: string | null;
  invoiceTotalIqd?: Prisma.Decimal | number | null;
  weightKg?: number | null;
};

export type AutoAssignResult = {
  deliveryCompanyId: string | null;
  deliveryZoneId:    string | null;
  shippingCostIqd:   Prisma.Decimal;
  reason:            string;
  candidates:        Array<{
    companyId:    string;
    code:         string;
    nameAr:       string;
    cost:         string;
    successRate:  string;
    rejected?:    string;
  }>;
};

/**
 * AutoAssignService picks the best DeliveryCompany for a new delivery.
 *
 * Selection rules (Tier 3 deterministic — no AI yet):
 *   1. Resolve a DeliveryZone from explicit zoneId or by city match.
 *   2. Filter active, non-suspended companies that have a rate for that zone
 *      AND honor invoice value bounds AND support COD if the order is COD.
 *   3. Compute landed cost: rate.baseFee + perKg*weight, clamped to min/max.
 *   4. Sort by (cost asc, successRate desc, avgDeliveryHours asc).
 *   5. If no zone match, fall back to companies with flatFeePerOrderIqd > 0.
 *   6. If still nothing, return null — caller decides (manual assignment).
 *
 * Always returns the candidate list (even rejected ones) for observability;
 * the UI surfaces "why this company won" without a separate query.
 */
@Injectable()
export class AutoAssignService {
  constructor(private readonly prisma: PrismaService) {}

  async pick(ctx: AutoAssignContext, requireCod = false): Promise<AutoAssignResult> {
    const zoneId = await this.resolveZoneId(ctx);
    const weight = ctx.weightKg && ctx.weightKg > 0 ? new Prisma.Decimal(ctx.weightKg) : new Prisma.Decimal(0);
    const invoiceTotal =
      ctx.invoiceTotalIqd !== null && ctx.invoiceTotalIqd !== undefined
        ? new Prisma.Decimal(ctx.invoiceTotalIqd as any)
        : null;

    const candidates: AutoAssignResult['candidates'] = [];

    if (zoneId) {
      const rates = await this.prisma.deliveryCompanyRate.findMany({
        where: {
          deliveryZoneId: zoneId,
          isActive:       true,
          deliveryCompany: {
            companyId:       ctx.companyId,
            isActive:        true,
            autoSuspendedAt: null,
            deletedAt:       null,
            ...(requireCod ? { supportsCod: true } : {}),
          },
        },
        include: {
          deliveryCompany: true,
        },
      });

      const ranked: Array<{
        rate:     typeof rates[number];
        cost:     Prisma.Decimal;
      }> = [];

      for (const r of rates) {
        const co = r.deliveryCompany;
        // Bound check
        if (invoiceTotal && co.minOrderValueIqd && invoiceTotal.lt(co.minOrderValueIqd as any)) {
          candidates.push({
            companyId:   co.id,
            code:        co.code,
            nameAr:      co.nameAr,
            cost:        '0',
            successRate: co.successRatePct.toString(),
            rejected:    `قيمة الفاتورة أقل من الحد الأدنى (${co.minOrderValueIqd})`,
          });
          continue;
        }
        if (invoiceTotal && co.maxOrderValueIqd && invoiceTotal.gt(co.maxOrderValueIqd as any)) {
          candidates.push({
            companyId:   co.id,
            code:        co.code,
            nameAr:      co.nameAr,
            cost:        '0',
            successRate: co.successRatePct.toString(),
            rejected:    `قيمة الفاتورة أعلى من الحد الأقصى (${co.maxOrderValueIqd})`,
          });
          continue;
        }
        const cost = this.computeCost(r, weight);
        ranked.push({ rate: r, cost });
        candidates.push({
          companyId:   co.id,
          code:        co.code,
          nameAr:      co.nameAr,
          cost:        cost.toString(),
          successRate: co.successRatePct.toString(),
        });
      }

      if (ranked.length > 0) {
        ranked.sort((a, b) => {
          // 1. cost asc
          const costCmp = a.cost.comparedTo(b.cost as any);
          if (costCmp !== 0) return costCmp;
          // 2. successRate desc
          const srCmp = (b.rate.deliveryCompany.successRatePct as any as Prisma.Decimal)
            .comparedTo(a.rate.deliveryCompany.successRatePct as any);
          if (srCmp !== 0) return srCmp;
          // 3. avgDeliveryHours asc
          return (a.rate.deliveryCompany.avgDeliveryHours as any as Prisma.Decimal)
            .comparedTo(b.rate.deliveryCompany.avgDeliveryHours as any);
        });
        const winner = ranked[0];
        return {
          deliveryCompanyId: winner.rate.deliveryCompanyId,
          deliveryZoneId:    zoneId,
          shippingCostIqd:   winner.cost,
          reason: ranked.length === 1
            ? `auto: only company in zone (${winner.rate.deliveryCompany.code})`
            : `auto: cheapest of ${ranked.length} in zone (${winner.rate.deliveryCompany.code})`,
          candidates,
        };
      }
    }

    // Fallback: any active company with flatFeePerOrderIqd > 0
    const flatFallback = await this.prisma.deliveryCompany.findMany({
      where: {
        companyId:       ctx.companyId,
        isActive:        true,
        autoSuspendedAt: null,
        deletedAt:       null,
        flatFeePerOrderIqd: { gt: 0 },
        ...(requireCod ? { supportsCod: true } : {}),
      },
      orderBy: [{ flatFeePerOrderIqd: 'asc' }, { successRatePct: 'desc' }],
    });

    for (const co of flatFallback) {
      candidates.push({
        companyId:   co.id,
        code:        co.code,
        nameAr:      co.nameAr,
        cost:        co.flatFeePerOrderIqd.toString(),
        successRate: co.successRatePct.toString(),
      });
    }

    if (flatFallback.length > 0) {
      const winner = flatFallback[0];
      return {
        deliveryCompanyId: winner.id,
        deliveryZoneId:    zoneId,
        shippingCostIqd:   winner.flatFeePerOrderIqd as any as Prisma.Decimal,
        reason:            `fallback: no zone rate, picked cheapest flat-fee (${winner.code})`,
        candidates,
      };
    }

    return {
      deliveryCompanyId: null,
      deliveryZoneId:    zoneId,
      shippingCostIqd:   new Prisma.Decimal(0),
      reason:            'manual: no eligible company',
      candidates,
    };
  }

  private async resolveZoneId(ctx: AutoAssignContext): Promise<string | null> {
    if (ctx.deliveryZoneId) {
      const zone = await this.prisma.deliveryZone.findFirst({
        where: { id: ctx.deliveryZoneId, companyId: ctx.companyId, isActive: true },
        select: { id: true },
      });
      if (zone) return zone.id;
    }
    if (ctx.deliveryCity && ctx.deliveryCity.trim().length > 0) {
      const zone = await this.prisma.deliveryZone.findFirst({
        where: {
          companyId: ctx.companyId,
          city:      { equals: ctx.deliveryCity.trim(), mode: 'insensitive' },
          isActive:  true,
        },
        // prefer leaf nodes (highest level)
        orderBy: { level: 'desc' },
        select: { id: true },
      });
      if (zone) return zone.id;
    }
    return null;
  }

  private computeCost(
    rate: { baseFeeIqd: any; perKgIqd: any; minFeeIqd: any; maxFeeIqd: any },
    weight: Prisma.Decimal,
  ): Prisma.Decimal {
    const base = rate.baseFeeIqd as Prisma.Decimal;
    const perKg = rate.perKgIqd as Prisma.Decimal;
    let cost = base.plus(perKg.mul(weight));
    if (rate.minFeeIqd && cost.lt(rate.minFeeIqd as any)) cost = rate.minFeeIqd as Prisma.Decimal;
    if (rate.maxFeeIqd && cost.gt(rate.maxFeeIqd as any)) cost = rate.maxFeeIqd as Prisma.Decimal;
    return cost;
  }
}
