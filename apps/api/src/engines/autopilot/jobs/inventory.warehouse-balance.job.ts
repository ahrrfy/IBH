import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import { AutopilotJob, AutopilotJobContext, AutopilotJobMeta, AutopilotJobResult } from '../autopilot.types';

// Cron: 01:00 UTC daily. F3 defense-in-depth: detect negative InventoryBalance records.

@Injectable()
export class InventoryWarehouseBalanceJob implements AutopilotJob {
  private readonly logger = new Logger(InventoryWarehouseBalanceJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'inventory.warehouse-balance',
    domain: 'inventory',
    schedule: '0 1 * * *',
    companyScoped: true,
    titleAr: 'تدقيق أرصدة المستودعات',
    titleEn: 'Warehouse Balance Audit',
    description: 'Daily 01:00 — detects negative inventory balances (qtyOnHand < 0).',
  };

  constructor(private readonly prisma: PrismaService, private readonly engine: AutopilotEngineService) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    let negativeBalances: Array<{ id: string; variantId: string; warehouseId: string; qtyOnHand: unknown }> = [];
    try {
      negativeBalances = await this.prisma.inventoryBalance.findMany({
        where: { companyId: ctx.companyId, qtyOnHand: { lt: 0 } },
        select: { id: true, variantId: true, warehouseId: true, qtyOnHand: true },
        take: 100,
        orderBy: { qtyOnHand: 'asc' },
      });
    } catch (err) {
      this.logger.error(`[inventory.warehouse-balance] DB error: ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }
    if (negativeBalances.length === 0) return { status: 'completed', itemsProcessed: 0, exceptionsRaised: 0 };
    let exceptionsRaised = 0;
    for (const bal of negativeBalances) {
      const qty = Number(bal.qtyOnHand);
      try {
        await this.engine.raiseException({
          jobId: this.meta.id, domain: 'inventory', companyId: ctx.companyId, severity: 'high',
          title: `رصيد مخزون سالب — ${qty} وحدة`,
          description: `رصيد سالب (variantId: ${bal.variantId}, qty: ${qty})`,
          suggestedAction: 'مراجعة سجل المخزون وتسوية الفارق بجرد عاجل',
          payload: { balanceId: bal.id, variantId: bal.variantId, warehouseId: bal.warehouseId, qtyOnHand: qty },
        });
        exceptionsRaised++;
      } catch { /* continue */ }
    }
    return { status: exceptionsRaised > 0 ? 'exception_raised' : 'completed', itemsProcessed: negativeBalances.length, exceptionsRaised, details: { negativeBalanceCount: negativeBalances.length } };
  }
}