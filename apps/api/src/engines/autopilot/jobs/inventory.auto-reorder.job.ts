import { Injectable, Logger } from '@nestjs/common';
import { AutoReorderService } from '../../../modules/procurement/auto-reorder/auto-reorder.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: inventory.auto-reorder ────────────────────────────────────────
// Cron: 07:00 daily.
// Goal: scan inventory, refresh Q03 (low-stock) flags, and create draft POs
// per (supplier, warehouse) for every unresolved low-stock flag. Lines for
// which no preferred supplier can be picked are reported as exceptions so
// the manager can choose one.
//
// This job is a *thin wrapper* around the existing T42 AutoReorderService —
// the algorithm (preferred-supplier resolution, lead time, draft-PO creation)
// already exists and is hardened. T71 simply schedules + reports the result.

@Injectable()
export class InventoryAutoReorderJob implements AutopilotJob {
  private readonly logger = new Logger(InventoryAutoReorderJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'inventory.auto-reorder',
    domain: 'inventory',
    schedule: '0 7 * * *',
    companyScoped: true,
    titleAr: 'إعادة الطلب التلقائية',
    titleEn: 'Auto Reorder',
    description:
      'Daily 07:00 — scans low-stock flags and creates draft POs per supplier; raises exceptions for items with no preferred supplier.',
  };

  constructor(
    private readonly reorder: AutoReorderService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    let result: Awaited<ReturnType<AutoReorderService['run']>>;
    try {
      result = await this.reorder.run(ctx.companyId, {
        triggeredBy: 'autopilot',
      });
    } catch (err) {
      this.logger.error(
        `[T71] inventory.auto-reorder failed for company=${ctx.companyId}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }

    let exceptionsRaised = 0;
    // The AutoReorderService returns the list of draft POs it created. Any
    // open Q03 flag that did NOT end up in a draft PO is an item the engine
    // could not auto-pick a supplier for — surface it as an exception.
    const handledVariants = new Set(
      result.draftPos.flatMap((po) =>
        Object.keys(po as Record<string, unknown>).includes('lineCount')
          ? [`${po.supplierId}/${po.warehouseId}`]
          : [],
      ),
    );

    if (handledVariants.size === 0 && result.flagsCreated > 0) {
      // Nothing was auto-handled but we did detect shortages — at least one
      // exception so the manager knows reorder needs supplier setup.
      await this.engine.raiseException({
        jobId: this.meta.id,
        domain: 'inventory',
        companyId: ctx.companyId,
        severity: 'medium',
        title: 'انخفاض مخزون بدون مورد افتراضي',
        description: `تم اكتشاف ${result.flagsCreated} منتج تحت حد إعادة الطلب لكن لا يوجد لها مورد افتراضي محدد.`,
        suggestedAction: 'تعيين مورد مفضل لكل منتج في صفحة نقاط إعادة الطلب',
        payload: {
          runId: result.runId,
          flagsCreated: result.flagsCreated,
        },
      });
      exceptionsRaised++;
    }

    return {
      status:
        exceptionsRaised > 0
          ? 'exception_raised'
          : result.draftPosCreated === 0
            ? 'no_op'
            : 'completed',
      itemsProcessed: result.draftPosCreated,
      exceptionsRaised,
      details: {
        runId: result.runId,
        scannedSkus: result.scannedSkus,
        flagsCreated: result.flagsCreated,
        flagsResolved: result.flagsResolved,
        draftPosCreated: result.draftPosCreated,
      },
    };
  }
}
