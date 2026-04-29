import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import { AutopilotJob, AutopilotJobContext, AutopilotJobMeta, AutopilotJobResult } from '../autopilot.types';

// Cron: 04:00 UTC daily. Recompute loyalty tier for all customers based on loyaltyPoints.
// Tiers: platinum >= 10000, gold >= 5000, silver >= 1000, bronze >= 0.

const TIERS = [
  { name: 'platinum', minPoints: 10_000 },
  { name: 'gold',     minPoints: 5_000 },
  { name: 'silver',   minPoints: 1_000 },
  { name: 'bronze',   minPoints: 0 },
];

function resolveTier(points: number): string {
  for (const t of TIERS) {
    if (points >= t.minPoints) return t.name;
  }
  return 'bronze';
}

@Injectable()
export class SalesLoyaltyTierRecomputeJob implements AutopilotJob {
  private readonly logger = new Logger(SalesLoyaltyTierRecomputeJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'sales.loyalty-tier-recompute',
    domain: 'sales',
    schedule: '0 4 * * *',
    companyScoped: true,
    titleAr: 'إعادة احتساب درجات الولاء',
    titleEn: 'Loyalty Tier Recompute',
    description: 'Daily 04:00 — recomputes loyalty tier for every customer based on accumulated points.',
  };

  constructor(private readonly prisma: PrismaService, private readonly engine: AutopilotEngineService) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const BATCH = 500;
    let cursor: string | undefined;
    let totalUpdated = 0;
    let upgrades = 0;
    let downgrades = 0;

    for (;;) {
      const customers = await this.prisma.customer.findMany({
        where: { companyId: ctx.companyId, deletedAt: null },
        select: { id: true, loyaltyPoints: true, loyaltyTier: true },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });
      if (customers.length === 0) break;
      cursor = customers[customers.length - 1]!.id;

      for (const c of customers) {
        const newTier = resolveTier(c.loyaltyPoints);
        if (newTier === c.loyaltyTier) continue;
        const wasUpgrade = TIERS.findIndex(t => t.name === newTier) < TIERS.findIndex(t => t.name === (c.loyaltyTier ?? 'bronze'));
        await this.prisma.customer.update({ where: { id: c.id }, data: { loyaltyTier: newTier } }).catch(() => {});
        totalUpdated++;
        wasUpgrade ? upgrades++ : downgrades++;
      }
      if (customers.length < BATCH) break;
    }

    this.logger.log(`[sales.loyalty-tier-recompute] company=${ctx.companyId} updated=${totalUpdated} upgrades=${upgrades} downgrades=${downgrades}`);
    return { status: 'completed', itemsProcessed: totalUpdated, exceptionsRaised: 0, details: { totalUpdated, upgrades, downgrades } };
  }
}