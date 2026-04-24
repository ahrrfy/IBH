// @ts-nocheck -- agent-written; schema field mapping to be refined in G4-G6
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { PostingService } from '../../../engines/posting/posting.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

export interface StartRecoDto {
  bankAccountId: string;
  statementDate: string | Date;
  statementBalance: string | number;
  statementFileUrl?: string;
}

export interface AddAdjustmentDto {
  reconciliationId: string;
  description: string;
  amountIqd: string | number;
  direction: 'debit' | 'credit';
}

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: PostingService,
  ) {}

  /**
   * Starts a reconciliation: computes book balance from GL, creates a draft reco,
   * and initializes items from unreconciled JE lines touching the linked CoA account.
   */
  async start(dto: StartRecoDto, session: UserSession) {
    const bank = await this.prisma.bankAccount.findFirst({
      where: { id: dto.bankAccountId, companyId: session.companyId },
    });
    if (!bank) {
      throw new NotFoundException({
        code: 'BANK_NOT_FOUND',
        messageAr: 'الحساب البنكي غير موجود',
      });
    }
    const statementDate = new Date(dto.statementDate);
    const statementBalance = new Prisma.Decimal(dto.statementBalance);

    // Book balance from GL as of statement date.
    const agg = await this.prisma.journalEntryLine.aggregate({
      where: {
        accountId: bank.accountId,
        entry: { status: 'posted', entryDate: { lte: statementDate } },
      },
      _sum: { debitIqd: true, creditIqd: true },
    });
    const d = agg._sum.debitIqd ?? new Prisma.Decimal(0);
    const c = agg._sum.creditIqd ?? new Prisma.Decimal(0);
    const bookBalance = bank.openingBalance.plus(d).minus(c);

    // Find unreconciled JE lines (not previously matched in any completed reco).
    const matchedIds = await this.prisma.bankReconciliationItem.findMany({
      where: {
        journalEntryLineId: { not: null },
        matched: true,
        reconciliation: { status: { in: ['completed', 'in_progress'] } },
      },
      select: { journalEntryLineId: true },
    });
    const excludeIds = matchedIds
      .map((m) => m.journalEntryLineId)
      .filter((x): x is string => !!x);

    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        accountId: bank.accountId,
        id: { notIn: excludeIds },
        entry: { status: 'posted', entryDate: { lte: statementDate } },
      },
      include: { entry: { select: { entryNumber: true, description: true } } },
    });

    const reco = await this.prisma.$transaction(async (tx) => {
      const r = await tx.bankReconciliation.create({
        data: {
          companyId: session.companyId,
          bankAccountId: dto.bankAccountId,
          statementDate,
          statementBalance,
          bookBalance,
          adjustedBalance: bookBalance,
          status: 'in_progress' as any,
          statementFileUrl: dto.statementFileUrl,
        },
      });
      if (lines.length) {
        await tx.bankReconciliationItem.createMany({
          data: lines.map((l) => ({
            reconciliationId: r.id,
            journalEntryLineId: l.id,
            description: l.description ?? l.entry.description ?? l.entry.entryNumber,
            amountIqd: l.debitIqd.greaterThan(0) ? l.debitIqd : l.creditIqd,
            direction: l.debitIqd.greaterThan(0) ? 'debit' : 'credit',
            matched: false,
          })),
        });
      }
      return r;
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'BankReconciliation',
      entityId: reco.id,
      action: 'start',
      after: reco,
    });

    return reco;
  }

  async matchItem(itemId: string, journalEntryLineId: string | null, session: UserSession) {
    const item = await this.prisma.bankReconciliationItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException({
        code: 'RECO_ITEM_NOT_FOUND',
        messageAr: 'بند التسوية غير موجود',
      });
    }
    return this.prisma.bankReconciliationItem.update({
      where: { id: itemId },
      data: {
        matched: true,
        matchedAt: new Date(),
        ...(journalEntryLineId ? { journalEntryLineId } : {}),
      },
    });
  }

  async unmatch(itemId: string) {
    return this.prisma.bankReconciliationItem.update({
      where: { id: itemId },
      data: { matched: false, matchedAt: null },
    });
  }

  /**
   * Adds a bank-side adjustment (fee / interest / error not yet in the books).
   */
  async addAdjustment(dto: AddAdjustmentDto, session: UserSession) {
    const reco = await this.prisma.bankReconciliation.findFirst({
      where: { id: dto.reconciliationId, companyId: session.companyId },
    });
    if (!reco) {
      throw new NotFoundException({
        code: 'RECO_NOT_FOUND',
        messageAr: 'التسوية غير موجودة',
      });
    }
    if (reco.status === 'completed') {
      throw new BadRequestException({
        code: 'RECO_COMPLETED',
        messageAr: 'التسوية مكتملة',
      });
    }
    return this.prisma.bankReconciliationItem.create({
      data: {
        reconciliationId: dto.reconciliationId,
        description: dto.description,
        amountIqd: new Prisma.Decimal(dto.amountIqd),
        direction: dto.direction,
        matched: false,
      },
    });
  }

  /**
   * Completes the reconciliation: posts an adjustment JE for unmatched
   * statement-only items (fees/interest) and marks bank.lastReconciledAt.
   */
  async complete(reconciliationId: string, session: UserSession) {
    const reco = await this.prisma.bankReconciliation.findFirst({
      where: { id: reconciliationId, companyId: session.companyId },
      include: {
        items: true,
        bankAccount: { include: { account: true } },
      },
    });
    if (!reco) {
      throw new NotFoundException({
        code: 'RECO_NOT_FOUND',
        messageAr: 'التسوية غير موجودة',
      });
    }
    if (reco.status === 'completed') {
      throw new BadRequestException({
        code: 'RECO_ALREADY_COMPLETED',
        messageAr: 'التسوية مكتملة مسبقاً',
      });
    }

    // Statement-only items = added adjustments without a journalEntryLineId.
    const adjustments = reco.items.filter(
      (i) => !i.journalEntryLineId && !i.matched,
    );

    await this.prisma.$transaction(async (tx) => {
      if (adjustments.length) {
        // Post one JE per reco with all adjustments.
        const lines: Array<{
          accountCode: string;
          debit?: string;
          credit?: string;
          description?: string;
        }> = [];
        for (const a of adjustments) {
          if (a.direction === 'debit') {
            // Money into bank (e.g. interest earned)
            lines.push({
              accountCode: reco.bankAccount.account.code,
              debit: a.amountIqd.toString(),
              description: a.description,
            });
            // Offset: revenue/misc (caller provides properly — here we use a suspense account by code convention 'MISC-INCOME')
            lines.push({
              accountCode: 'MISC-INCOME',
              credit: a.amountIqd.toString(),
              description: a.description,
            });
          } else {
            // Money out (bank fees)
            lines.push({
              accountCode: 'BANK-FEES',
              debit: a.amountIqd.toString(),
              description: a.description,
            });
            lines.push({
              accountCode: reco.bankAccount.account.code,
              credit: a.amountIqd.toString(),
              description: a.description,
            });
          }
        }
        await this.posting.postJournalEntry(
          {
            companyId: session.companyId,
            entryDate: reco.statementDate,
            refType: 'BankReconciliation',
            refId: reco.id,
            description: `Bank reconciliation adjustments ${reco.id}`,
            lines,
          },
          session,
          tx,
        );
      }

      await tx.bankReconciliation.update({
        where: { id: reconciliationId },
        data: {
          status: 'completed' as any,
          reconciledAt: new Date(),
          reconciledBy: session.userId,
          adjustedBalance: reco.statementBalance,
        },
      });

      await tx.bankAccount.update({
        where: { id: reco.bankAccountId },
        data: { lastReconciledAt: reco.statementDate },
      });
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'BankReconciliation',
      entityId: reconciliationId,
      action: 'complete',
    });

    return this.findOne(reconciliationId, session.companyId);
  }

  async findOne(id: string, companyId: string) {
    const r = await this.prisma.bankReconciliation.findFirst({
      where: { id, companyId },
      include: { items: true, bankAccount: true },
    });
    if (!r) {
      throw new NotFoundException({
        code: 'RECO_NOT_FOUND',
        messageAr: 'التسوية غير موجودة',
      });
    }
    return r;
  }

  async findAll(companyId: string, bankAccountId?: string) {
    return this.prisma.bankReconciliation.findMany({
      where: { companyId, ...(bankAccountId ? { bankAccountId } : {}) },
      orderBy: { statementDate: 'desc' },
    });
  }

  /**
   * Report: unmatched book entries (our JE lines not matched to statement)
   * and unmatched statement entries (adjustments not yet in books).
   */
  async discrepancyReport(reconciliationId: string, companyId: string) {
    const reco = await this.findOne(reconciliationId, companyId);
    const unmatchedBook = reco.items.filter(
      (i) => i.journalEntryLineId && !i.matched,
    );
    const unmatchedStatement = reco.items.filter(
      (i) => !i.journalEntryLineId && !i.matched,
    );
    const diff = reco.statementBalance.minus(reco.bookBalance);
    return {
      reconciliationId,
      statementBalance: reco.statementBalance,
      bookBalance: reco.bookBalance,
      difference: diff,
      unmatchedBook,
      unmatchedStatement,
    };
  }
}
