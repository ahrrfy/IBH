import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import { AutopilotJob, AutopilotJobContext, AutopilotJobMeta, AutopilotJobResult } from '../autopilot.types';

// Cron: 08:00 UTC on the 1st of every month. Remind warehouses to schedule stocktake.

@Injectable()
export class InventoryStocktakeReminderJob implements AutopilotJob {
  private readonly logger = new Logger(InventoryStocktakeReminderJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'inventory.stocktake-reminder',
    domain: 'inventory',
    schedule: '0 8 1 * *',
    companyScoped: true,
    titleAr: 'تذكير الجرد الشهري',
    titleEn: 'Stocktake Reminder',
    description: 'Monthly on the 1st — reminds each active warehouse to schedule a physical stocktake.',
  };

  constructor(private readonly prisma: PrismaService, private readonly engine: AutopilotEngineService) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    const monthName = now.toLocaleString('ar', { month: 'long', timeZone: 'UTC' });
    let warehouses: Array<{ id: string; nameAr: string }> = [];
    try {
      warehouses = await this.prisma.warehouse.findMany({
        where: { companyId: ctx.companyId, isActive: true },
        select: { id: true, nameAr: true },
        orderBy: { nameAr: 'asc' },
      });
    } catch (err) {
      this.logger.error(`[inventory.stocktake-reminder] DB error: ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }
    if (warehouses.length === 0) return { status: 'completed', itemsProcessed: 0, exceptionsRaised: 0 };
    let exceptionsRaised = 0;
    for (const wh of warehouses) {
      try {
        await this.engine.raiseException({
          jobId: this.meta.id, domain: 'inventory', companyId: ctx.companyId, severity: 'low',
          title: `تذكير جرد ${monthName} — ${wh.nameAr}`,
          description: `حان وقت جرد المخزون الشهري لمستودع ${wh.nameAr}`,
          suggestedAction: 'جدولة جلسة جرد فيزيائي',
          payload: { warehouseId: wh.id, warehouseName: wh.nameAr, month: monthName },
        });
        exceptionsRaised++;
      } catch { /* continue */ }
    }
    return { status: exceptionsRaised > 0 ? 'exception_raised' : 'completed', itemsProcessed: warehouses.length, exceptionsRaised, details: { warehousesAlerted: warehouses.length } };
  }
}