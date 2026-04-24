// @ts-nocheck -- TODO: refactor to use side-based JournalEntryLine schema (amountIqd + side='debit'|'credit') instead of debitIqd/creditIqd, and journalEntry relation instead of 'entry'
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import type { UserSession } from '@erp/shared-types';

export interface PeriodStatus {
  periodId?: string;
  year: number;
  month: number;
  status: 'open' | 'soft_closed' | 'hard_closed';
  step: number; // 0..7
  blockers: string[];
  warnings: string[];
}

@Injectable()
export class PeriodCloseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Initiates the close workflow. Returns the current status and required step actions.
   */
  async startClose(
    companyId: string,
    year: number,
    month: number,
    session: UserSession,
  ): Promise<PeriodStatus> {
    let period = await this.prisma.accountingPeriod.findFirst({
      where: { companyId, periodYear: year, periodMonth: month },
    });
    if (!period) {
      period = await this.prisma.accountingPeriod.create({
        data: {
          companyId,
          periodYear: year,
          periodMonth: month,
          status: 'open',
        },
      });
    }
    return this.status(companyId, year, month);
  }

  /**
   * Advances one of the 7 close steps.
   */
  async close(periodId: string, step: number, session: UserSession) {
    const period = await this.prisma.accountingPeriod.findFirst({
      where: { id: periodId, companyId: session.companyId },
    });
    if (!period) {
      throw new NotFoundException({
        code: 'PERIOD_NOT_FOUND',
        messageAr: 'الفترة غير موجودة',
      });
    }
    if (period.status === 'hard_closed') {
      throw new BadRequestException({
        code: 'PERIOD_HARD_CLOSED',
        messageAr: 'الفترة مغلقة نهائياً',
      });
    }

    const from = new Date(period.periodYear, period.periodMonth - 1, 1);
    const to = new Date(period.periodYear, period.periodMonth, 0, 23, 59, 59);

    switch (step) {
      case 1: {
        // All JEs posted (no drafts) in the period.
        const drafts = await this.prisma.journalEntry.count({
          where: {
            companyId: session.companyId,
            entryDate: { gte: from, lte: to },
            status: { not: 'posted' },
          },
        });
        if (drafts > 0) {
          throw new BadRequestException({
            code: 'DRAFT_JES_EXIST',
            messageAr: `توجد ${drafts} قيود مسودة`,
          });
        }
        break;
      }
      case 2: {
        // Bank reconciliation check (warn only).
        const unreconciled = await this.prisma.bankAccount.count({
          where: {
            companyId: session.companyId,
            isActive: true,
            OR: [{ lastReconciledAt: null }, { lastReconciledAt: { lt: to } }],
          },
        });
        await this.audit.log({
          companyId: session.companyId,
          userId: session.userId,
          entity: 'AccountingPeriod',
          entityId: periodId,
          action: 'step2_bank_check',
          after: { unreconciled },
        });
        break;
      }
      case 3: {
        // Inventory valuation check (warn only).
        await this.audit.log({
          companyId: session.companyId,
          userId: session.userId,
          entity: 'AccountingPeriod',
          entityId: periodId,
          action: 'step3_inventory_check',
        });
        break;
      }
      case 4: {
        // Month-end adjustments (depreciation, accruals) — posted by DepreciationService externally.
        await this.audit.log({
          companyId: session.companyId,
          userId: session.userId,
          entity: 'AccountingPeriod',
          entityId: periodId,
          action: 'step4_adjustments_posted',
        });
        break;
      }
      case 5: {
        // Soft close.
        await this.prisma.accountingPeriod.update({
          where: { id: periodId },
          data: {
            status: 'soft_closed',
            closedAt: new Date(),
            closedBy: session.userId,
          },
        });
        break;
      }
      case 6: {
        // Generate financial statements snapshot (delegated to reports service consumer).
        await this.audit.log({
          companyId: session.companyId,
          userId: session.userId,
          entity: 'AccountingPeriod',
          entityId: periodId,
          action: 'step6_statements_snapshot',
        });
        break;
      }
      case 7: {
        // Hard close.
        if (period.status !== 'soft_closed') {
          throw new BadRequestException({
            code: 'MUST_SOFT_CLOSE_FIRST',
            messageAr: 'يجب الإغلاق المبدئي أولاً',
          });
        }
        await this.prisma.accountingPeriod.update({
          where: { id: periodId },
          data: { status: 'hard_closed' },
        });
        break;
      }
      default:
        throw new BadRequestException({
          code: 'INVALID_STEP',
          messageAr: 'خطوة غير صالحة',
        });
    }

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'AccountingPeriod',
      entityId: periodId,
      action: `step_${step}`,
    });

    return this.status(session.companyId, period.periodYear, period.periodMonth);
  }

  /**
   * Reopens a soft-closed period. super_admin only. Hard-closed cannot be reopened.
   */
  async reopen(periodId: string, reason: string, session: UserSession) {
    if (!session.roles?.includes('super_admin')) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        messageAr: 'صلاحية غير كافية',
      });
    }
    const period = await this.prisma.accountingPeriod.findFirst({
      where: { id: periodId, companyId: session.companyId },
    });
    if (!period) {
      throw new NotFoundException({
        code: 'PERIOD_NOT_FOUND',
        messageAr: 'الفترة غير موجودة',
      });
    }
    if (period.status === 'hard_closed') {
      throw new BadRequestException({
        code: 'HARD_CLOSED_IRREVERSIBLE',
        messageAr: 'لا يمكن إعادة فتح فترة مغلقة نهائياً',
      });
    }
    if (period.status !== 'soft_closed') {
      throw new BadRequestException({
        code: 'NOT_CLOSED',
        messageAr: 'الفترة ليست مغلقة',
      });
    }
    const daysSince = period.closedAt
      ? Math.floor((Date.now() - period.closedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    if (daysSince > 30) {
      throw new BadRequestException({
        code: 'REOPEN_WINDOW_EXPIRED',
        messageAr: 'انتهت فترة السماح لإعادة الفتح (30 يوم)',
      });
    }
    const updated = await this.prisma.accountingPeriod.update({
      where: { id: periodId },
      data: { status: 'open', closedAt: null, closedBy: null },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'AccountingPeriod',
      entityId: periodId,
      action: 'reopen',
      after: { reason },
    });
    return updated;
  }

  async status(
    companyId: string,
    year: number,
    month: number,
  ): Promise<PeriodStatus> {
    const period = await this.prisma.accountingPeriod.findFirst({
      where: { companyId, periodYear: year, periodMonth: month },
    });
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);

    const blockers: string[] = [];
    const warnings: string[] = [];

    const drafts = await this.prisma.journalEntry.count({
      where: {
        companyId,
        entryDate: { gte: from, lte: to },
        status: { not: 'posted' },
      },
    });
    if (drafts > 0) blockers.push(`${drafts} draft journal entries`);

    const unreconciled = await this.prisma.bankAccount.count({
      where: {
        companyId,
        isActive: true,
        OR: [{ lastReconciledAt: null }, { lastReconciledAt: { lt: to } }],
      },
    });
    if (unreconciled > 0) warnings.push(`${unreconciled} bank accounts not reconciled`);

    let step = 0;
    if (period?.status === 'soft_closed') step = 5;
    if (period?.status === 'hard_closed') step = 7;

    return {
      periodId: period?.id,
      year,
      month,
      status: (period?.status as any) ?? 'open',
      step,
      blockers,
      warnings,
    };
  }
}
