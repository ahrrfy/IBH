import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: finance.depreciation-post ─────────────────────────────────────
// Cron: 03:00 UTC on the 1st of each month.
// Goal: remind the finance team if monthly depreciation postings are pending
// for any active fixed assets.
//
// Business rule (F2): depreciation posting is a manual-approval action that
// results in journal entries. This job does NOT post depreciation itself —
// it only checks whether an AssetDepreciation record exists for the current
// month for each active FixedAsset. Missing records mean the finance team
// hasn't run the monthly depreciation batch yet.

@Injectable()
export class FinanceDepreciationPostJob implements AutopilotJob {
  private readonly logger = new Logger(FinanceDepreciationPostJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'finance.depreciation-post',
    domain: 'finance',
    schedule: '0 3 1 * *',
    companyScoped: true,
    titleAr: 'تذكير ترحيل الإهلاك الشهري',
    titleEn: 'Depreciation Post Reminder',
    description:
      '03:00 UTC on 1st of month — checks whether monthly depreciation has been posted for all active fixed assets.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    // The job runs on the 1st — we check if depreciation for the *current*
    // month has been posted. On Jan 1st we check January, etc.
    const periodYear  = ctx.startedAt.getFullYear();
    const periodMonth = ctx.startedAt.getMonth() + 1; // 1-indexed

    try {
      // Count active assets for this company.
      const activeAssets = await this.prisma.fixedAsset.findMany({
        where: {
          companyId: ctx.companyId,
          status: 'active',
        },
        select: { id: true, number: true, nameAr: true },
      });

      if (activeAssets.length === 0) {
        return {
          status: 'no_op',
          itemsProcessed: 0,
          exceptionsRaised: 0,
          details: { reason: 'no-active-fixed-assets' },
        };
      }

      // Find assets that already have a depreciation entry for this period.
      const postedAssetIds = await this.prisma.assetDepreciation.findMany({
        where: {
          assetId: { in: activeAssets.map((a) => a.id) },
          periodYear,
          periodMonth,
        },
        select: { assetId: true },
      });

      const postedSet = new Set(postedAssetIds.map((r) => r.assetId));
      const pendingAssets = activeAssets.filter((a) => !postedSet.has(a.id));

      if (pendingAssets.length === 0) {
        return {
          status: 'no_op',
          itemsProcessed: activeAssets.length,
          exceptionsRaised: 0,
          details: {
            periodYear,
            periodMonth,
            allPosted: true,
            totalAssets: activeAssets.length,
          },
        };
      }

      const periodLabel = `${periodYear}-${String(periodMonth).padStart(2, '0')}`;

      await this.engine.raiseException({
        jobId: this.meta.id,
        domain: 'finance',
        companyId: ctx.companyId,
        severity: 'medium',
        title: `إهلاك ${periodLabel} لم يُرحَّل — ${pendingAssets.length} أصل`,
        description:
          `${pendingAssets.length} أصل ثابت نشط بدون قيد إهلاك لشهر ${periodLabel} ` +
          `من أصل ${activeAssets.length} أصل إجمالاً. يجب ترحيل الإهلاك الشهري قبل إقفال الفترة.`,
        suggestedAction:
          'اذهب إلى وحدة الأصول الثابتة > ترحيل الإهلاك الشهري وشغّل الدُفعة',
        payload: {
          periodYear,
          periodMonth,
          totalActiveAssets: activeAssets.length,
          pendingCount: pendingAssets.length,
          pendingAssetIds: pendingAssets.slice(0, 20).map((a) => ({
            id: a.id,
            number: a.number,
            nameAr: a.nameAr,
          })),
        },
      });

      this.logger.warn(
        `[T71] depreciation-post: ${pendingAssets.length}/${activeAssets.length} assets pending for ${periodLabel} company=${ctx.companyId}`,
      );

      return {
        status: 'exception_raised',
        itemsProcessed: activeAssets.length,
        exceptionsRaised: 1,
        details: {
          periodYear,
          periodMonth,
          totalAssets: activeAssets.length,
          pendingCount: pendingAssets.length,
        },
      };
    } catch (err) {
      this.logger.error(
        `[T71] depreciation-post failed for company=${ctx.companyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        status: 'failed',
        itemsProcessed: 0,
        exceptionsRaised: 0,
        details: {
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}
