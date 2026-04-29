import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

/** Monthly 1st 01:00 — flag inactive price lists and missing default. */
@Injectable()
export class SalesPriceListRolloverJob implements AutopilotJob {
  private readonly logger = new Logger(SalesPriceListRolloverJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'sales.price-list-rollover',
    domain: 'sales',
    schedule: '0 1 1 * *',
    companyScoped: true,
    titleAr: 'تحديث قوائم الأسعار',
    titleEn: 'Price List Rollover',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { companyId } = ctx;
    let exceptionsRaised = 0;
    let itemsProcessed = 0;

    try {
      const [inactive, active] = await Promise.all([
        this.prisma.priceList.findMany({
          where: { companyId, isActive: false },
          include: { _count: { select: { items: true } } },
        }),
        this.prisma.priceList.findMany({
          where: { companyId, isActive: true },
        }),
      ]);

      itemsProcessed = inactive.length + active.length;

      for (const pl of inactive) {
        if (pl._count.items > 0) {
          await this.engine.raiseException({
            jobId: this.meta.id, domain: 'sales', companyId, severity: 'low',
            title: 'قائمة أسعار غير نشطة تحتوي بنوداً',
            description: `قائمة أسعار "${pl.nameAr}" غير نشطة وتحتوي على ${pl._count.items} بند — يُنصح بمراجعتها`,
            suggestedAction: 'تفعيل القائمة أو حذف بنودها',
            payload: { priceListId: pl.id, itemCount: pl._count.items },
          });
          exceptionsRaised++;
        }
      }

      const hasDefault = active.some((pl) => pl.isDefault);
      if (!hasDefault && active.length > 0) {
        await this.engine.raiseException({
          jobId: this.meta.id, domain: 'sales', companyId, severity: 'medium',
          title: 'لا توجد قائمة أسعار افتراضية',
          description: 'لا توجد قائمة أسعار افتراضية نشطة — قد يسبب أخطاء في الفوترة',
          suggestedAction: 'تحديد قائمة أسعار افتراضية',
          payload: { activeCount: active.length },
        });
        exceptionsRaised++;
      }
    } catch (err) {
      this.logger.error(`[${this.meta.id}] ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'failed', itemsProcessed, exceptionsRaised, details: { reason: 'db_error' } };
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed,
      exceptionsRaised,
    };
  }
}