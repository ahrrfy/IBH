import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

const WARNING_DAYS = 60;
const CRITICAL_DAYS = 14;

/**
 * Monday 06:00 — scan GRN lines for batches expiring within 60 days.
 * Raises 'high' for < 14 days remaining, 'medium' for < 60 days.
 */
@Injectable()
export class InventoryShelfLifeAlertJob implements AutopilotJob {
  private readonly logger = new Logger(InventoryShelfLifeAlertJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'inventory.shelf-life-alert',
    domain: 'inventory',
    schedule: '0 6 * * 1',
    companyScoped: true,
    titleAr: 'تنبيهات قرب نهاية العمر الافتراضي',
    titleEn: 'Shelf-Life Alert',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { companyId } = ctx;
    const now = new Date();
    const warningCutoff = new Date(now.getTime() + WARNING_DAYS * 86_400_000);
    let exceptionsRaised = 0;

    let lines: Array<{
      id: string;
      expiryDate: Date | null;
      qtyAccepted: unknown;
      grn: { warehouseId: string; number: string };
    }> = [];

    try {
      lines = await this.prisma.gRNLine.findMany({
        where: {
          grn: { companyId, status: { in: ['accepted', 'partially_accepted'] as any[] } },
          expiryDate: { not: null, gt: now, lte: warningCutoff },
          qtyAccepted: { gt: 0 },
        },
        include: { grn: { select: { warehouseId: true, number: true } } },
        take: 100,
      });
    } catch (err) {
      this.logger.error(`[${this.meta.id}] ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'failed', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    for (const l of lines) {
      const daysLeft = Math.ceil(
        ((l.expiryDate as Date).getTime() - now.getTime()) / 86_400_000,
      );
      const isCritical = daysLeft <= CRITICAL_DAYS;
      await this.engine.raiseException({
        jobId: this.meta.id, domain: 'inventory', companyId,
        severity: isCritical ? 'high' : 'medium',
        title: isCritical ? 'صلاحية وشيكة الانتهاء' : 'تحذير انتهاء الصلاحية',
        description: `بند في مستلزمات GRN #${l.grn.number}: ينتهي خلال ${daysLeft} يوم (الكمية: ${l.qtyAccepted})`,
        suggestedAction: isCritical ? 'تصفية الكمية فوراً أو إتلافها وفق الإجراء المعتمد' : 'جدولة تصفية الكمية قبل انتهاء الصلاحية',
        payload: { grnLineId: l.id, warehouseId: l.grn.warehouseId, daysLeft, qty: l.qtyAccepted },
      });
      exceptionsRaised++;
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: lines.length,
      exceptionsRaised,
      details: { expiringWithin60Days: lines.length },
    };
  }
}