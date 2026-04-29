import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import { AutopilotJob, AutopilotJobContext, AutopilotJobMeta, AutopilotJobResult } from '../autopilot.types';

// Cron: 07:00 UTC on Mondays. Find active ProductVariants with no barcode.

const MAX_VARIANTS = 200;
const REPORT_SAMPLE = 20;

@Injectable()
export class InventoryBarcodeMissingJob implements AutopilotJob {
  private readonly logger = new Logger(InventoryBarcodeMissingJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'inventory.barcode-missing',
    domain: 'inventory',
    schedule: '0 7 * * 1',
    companyScoped: true,
    titleAr: 'منتجات بدون باركود',
    titleEn: 'Missing Barcode Detect',
    description: 'Monday 07:00 — detects active product variants with no assigned barcode.',
  };

  constructor(private readonly prisma: PrismaService, private readonly engine: AutopilotEngineService) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    let missing: Array<{ id: string; sku: string }> = [];
    try {
      missing = await this.prisma.productVariant.findMany({
        where: { companyId: ctx.companyId, isActive: true, deletedAt: null, barcodes: { none: {} } },
        select: { id: true, sku: true },
        take: MAX_VARIANTS,
        orderBy: { createdAt: 'asc' },
      });
    } catch (err) {
      this.logger.error(`[inventory.barcode-missing] DB error: ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }
    if (missing.length === 0) return { status: 'completed', itemsProcessed: 0, exceptionsRaised: 0 };
    const sample = missing.slice(0, REPORT_SAMPLE).map(v => v.sku).join(', ');
    const more = missing.length > REPORT_SAMPLE ? ` (+${missing.length - REPORT_SAMPLE} more)` : '';
    let exceptionsRaised = 0;
    try {
      await this.engine.raiseException({
        jobId: this.meta.id, domain: 'inventory', companyId: ctx.companyId, severity: 'low',
        title: `${missing.length} منتج بدون باركود`,
        description: `المنتجات التالية لا تملك باركود: ${sample}${more}`,
        suggestedAction: 'إضافة باركود لكل منتج قبل وصوله لنقطة البيع',
        payload: { totalCount: missing.length, sample: missing.slice(0, REPORT_SAMPLE) },
      });
      exceptionsRaised++;
    } catch { /* continue */ }
    return { status: exceptionsRaised > 0 ? 'exception_raised' : 'completed', itemsProcessed: missing.length, exceptionsRaised, details: { missingBarcodeCount: missing.length } };
  }
}