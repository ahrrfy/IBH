import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import { AutopilotJob, AutopilotJobContext, AutopilotJobMeta, AutopilotJobResult } from '../autopilot.types';

// Cron: every 6 hours. Flags draft journal entries older than 7 days (stuck/forgotten).

const STALE_DAYS = 7;
const MAX_ALERTS = 50;

@Injectable()
export class FinanceUnbalancedJeDetectJob implements AutopilotJob {
  private readonly logger = new Logger(FinanceUnbalancedJeDetectJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'finance.unbalanced-je-detect',
    domain: 'finance',
    schedule: '0 */6 * * *',
    companyScoped: true,
    titleAr: 'كشف القيود غير المتوازنة',
    titleEn: 'Unbalanced JE Detect',
    description: 'Every 6 hours — flags draft journal entries older than 7 days.',
  };

  constructor(private readonly prisma: PrismaService, private readonly engine: AutopilotEngineService) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - STALE_DAYS * 86_400_000);
    let staleEntries: Array<{ id: string; entryNumber: string; createdAt: Date }> = [];
    try {
      staleEntries = await this.prisma.journalEntry.findMany({
        where: { companyId: ctx.companyId, status: 'draft' as any, createdAt: { lt: staleCutoff } },
        select: { id: true, entryNumber: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: MAX_ALERTS,
      });
    } catch (err) {
      this.logger.error(`[finance.unbalanced-je-detect] DB error: ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }
    if (staleEntries.length === 0) return { status: 'completed', itemsProcessed: 0, exceptionsRaised: 0 };
    let exceptionsRaised = 0;
    for (const je of staleEntries) {
      const staleDays = Math.floor((now.getTime() - je.createdAt.getTime()) / 86_400_000);
      try {
        await this.engine.raiseException({
          jobId: this.meta.id, domain: 'finance', companyId: ctx.companyId, severity: 'medium',
          title: `قيد محاسبي معلّق منذ ${staleDays} يوم — ${je.entryNumber}`,
          description: `قيد رقم ${je.entryNumber} لا يزال بحالة مسودة منذ ${staleDays} يوم`,
          suggestedAction: 'مراجعة القيد وترحيله أو حذفه',
          payload: { journalEntryId: je.id, entryNumber: je.entryNumber, staleDays },
        });
        exceptionsRaised++;
      } catch { /* continue */ }
    }
    return { status: exceptionsRaised > 0 ? 'exception_raised' : 'completed', itemsProcessed: staleEntries.length, exceptionsRaised, details: { staleDraftCount: staleEntries.length } };
  }
}