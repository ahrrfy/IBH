import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import { AutopilotJob, AutopilotJobContext, AutopilotJobMeta, AutopilotJobResult } from '../autopilot.types';

// Cron: 04:00 UTC on Mondays. Find customers with identical phone numbers (likely duplicates).

const MAX_GROUPS = 50;

@Injectable()
export class CrmDuplicateMergeSuggestJob implements AutopilotJob {
  private readonly logger = new Logger(CrmDuplicateMergeSuggestJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'crm.duplicate-merge-suggest',
    domain: 'crm',
    schedule: '0 4 * * 1',
    companyScoped: true,
    titleAr: 'مقترحات دمج العملاء المكررين',
    titleEn: 'Duplicate Merge Suggest',
    description: 'Monday 04:00 — finds customers sharing the same phone number (likely duplicates).',
  };

  constructor(private readonly prisma: PrismaService, private readonly engine: AutopilotEngineService) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    // Find phone numbers shared by 2+ active customers.
    type DupRow = { phone: string; cnt: bigint };
    let duplicatePhones: DupRow[] = [];
    try {
      duplicatePhones = await this.prisma.$queryRaw<DupRow[]>`
        SELECT phone, COUNT(*) as cnt
        FROM customers
        WHERE "companyId" = ${ctx.companyId}
          AND phone IS NOT NULL
          AND "deletedAt" IS NULL
        GROUP BY phone
        HAVING COUNT(*) > 1
        ORDER BY cnt DESC
        LIMIT ${MAX_GROUPS}
      `;
    } catch (err) {
      this.logger.error(`[crm.duplicate-merge-suggest] DB error: ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    if (duplicatePhones.length === 0) return { status: 'completed', itemsProcessed: 0, exceptionsRaised: 0 };

    const totalDups = duplicatePhones.reduce((s, r) => s + Number(r.cnt), 0);
    let exceptionsRaised = 0;
    try {
      await this.engine.raiseException({
        jobId: this.meta.id, domain: 'crm', companyId: ctx.companyId, severity: 'low',
        title: `${duplicatePhones.length} رقم هاتف مكرر بين العملاء`,
        description: `يوجد ${totalDups} سجل عميل يشتركون في ${duplicatePhones.length} رقم هاتف — مرشحون للدمج`,
        suggestedAction: 'مراجعة سجلات العملاء المكررة ودمجها من صفحة إدارة العملاء',
        payload: { duplicatePhoneGroups: duplicatePhones.length, totalAffectedRecords: totalDups },
      });
      exceptionsRaised++;
    } catch { /* continue */ }

    return { status: 'exception_raised', itemsProcessed: totalDups, exceptionsRaised, details: { duplicateGroups: duplicatePhones.length, totalAffected: totalDups } };
  }
}