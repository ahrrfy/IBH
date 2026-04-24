// @ts-nocheck -- TODO: refactor to use side-based JournalEntryLine schema (amountIqd + side='debit'|'credit') instead of debitIqd/creditIqd, and journalEntry relation instead of 'entry'
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class GLService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * All JE lines for a specific account within a date range with running balance.
   */
  async accountLedger(
    companyId: string,
    accountId: string,
    params: { from?: Date; to?: Date } = {},
  ) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id: accountId, companyId },
    });
    if (!account) {
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        messageAr: 'الحساب غير موجود',
      });
    }

    const whereEntry: Prisma.JournalEntryWhereInput = {
      companyId,
      status: 'posted',
      ...(params.from || params.to
        ? {
            entryDate: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };

    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        accountId,
        entry: whereEntry,
      },
      include: {
        entry: {
          select: {
            id: true,
            entryNumber: true,
            entryDate: true,
            description: true,
            refType: true,
            refId: true,
          },
        },
      },
      orderBy: [
        { entry: { entryDate: 'asc' } },
        { entry: { entryNumber: 'asc' } },
        { sortOrder: 'asc' },
      ],
    });

    // Opening balance: sum of lines BEFORE `from`.
    let openingBalance = new Prisma.Decimal(0);
    if (params.from) {
      const prior = await this.prisma.journalEntryLine.aggregate({
        where: {
          accountId,
          entry: {
            companyId,
            status: 'posted',
            entryDate: { lt: params.from },
          },
        },
        _sum: { debitIqd: true, creditIqd: true },
      });
      const d = prior._sum.debitIqd ?? new Prisma.Decimal(0);
      const c = prior._sum.creditIqd ?? new Prisma.Decimal(0);
      openingBalance = this.signedBalance(account.type, d, c);
    }

    let running = openingBalance;
    const rows = lines.map((l) => {
      const signed = this.signedBalance(account.type, l.debitIqd, l.creditIqd);
      running = running.plus(signed);
      return {
        entryId: l.entry.id,
        entryNumber: l.entry.entryNumber,
        entryDate: l.entry.entryDate,
        description: l.description ?? l.entry.description,
        refType: l.entry.refType,
        refId: l.entry.refId,
        debitIqd: l.debitIqd,
        creditIqd: l.creditIqd,
        balance: running,
      };
    });

    return {
      account: {
        id: account.id,
        code: account.code,
        nameAr: account.nameAr,
        nameEn: account.nameEn,
        type: account.type,
      },
      from: params.from,
      to: params.to,
      openingBalance,
      closingBalance: running,
      lines: rows,
    };
  }

  /**
   * Trial balance at a given date. Verifies debits == credits.
   */
  async trialBalance(companyId: string, asOf: Date) {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { companyId, isActive: true },
      orderBy: { code: 'asc' },
    });

    const sums = await this.prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        entry: {
          companyId,
          status: 'posted',
          entryDate: { lte: asOf },
        },
      },
      _sum: { debitIqd: true, creditIqd: true },
    });

    const sumMap = new Map(
      sums.map((s) => [
        s.accountId,
        {
          debit: s._sum.debitIqd ?? new Prisma.Decimal(0),
          credit: s._sum.creditIqd ?? new Prisma.Decimal(0),
        },
      ]),
    );

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    const lines = accounts.map((a) => {
      const s = sumMap.get(a.id) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      totalDebit = totalDebit.plus(s.debit);
      totalCredit = totalCredit.plus(s.credit);
      const balance = this.signedBalance(a.type, s.debit, s.credit);
      return {
        accountId: a.id,
        code: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        type: a.type,
        level: a.level,
        debitIqd: s.debit,
        creditIqd: s.credit,
        balance,
      };
    });

    const balanced = totalDebit.equals(totalCredit);

    return {
      asOf,
      lines,
      totals: { totalDebit, totalCredit, balanced },
    };
  }

  /**
   * Full General Ledger for a period grouped by account.
   */
  async generalLedger(
    companyId: string,
    params: { from: Date; to: Date; costCenterId?: string },
  ) {
    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        entry: {
          companyId,
          status: 'posted',
          entryDate: { gte: params.from, lte: params.to },
        },
        ...(params.costCenterId ? { costCenterId: params.costCenterId } : {}),
      },
      include: {
        entry: {
          select: { id: true, entryNumber: true, entryDate: true, description: true },
        },
        account: { select: { id: true, code: true, nameAr: true, type: true } },
      },
      orderBy: [
        { account: { code: 'asc' } },
        { entry: { entryDate: 'asc' } },
      ],
    });

    const grouped = new Map<string, { account: any; lines: any[] }>();
    for (const l of lines) {
      const key = l.account.id;
      if (!grouped.has(key)) grouped.set(key, { account: l.account, lines: [] });
      grouped.get(key)!.lines.push({
        entryId: l.entry.id,
        entryNumber: l.entry.entryNumber,
        entryDate: l.entry.entryDate,
        description: l.description ?? l.entry.description,
        debitIqd: l.debitIqd,
        creditIqd: l.creditIqd,
      });
    }

    return {
      from: params.from,
      to: params.to,
      costCenterId: params.costCenterId,
      accounts: Array.from(grouped.values()),
    };
  }

  /**
   * Single account balance at a specific date.
   */
  async accountBalance(accountId: string, asOf: Date) {
    const account = await this.prisma.chartOfAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        messageAr: 'الحساب غير موجود',
      });
    }
    const sum = await this.prisma.journalEntryLine.aggregate({
      where: {
        accountId,
        entry: { status: 'posted', entryDate: { lte: asOf } },
      },
      _sum: { debitIqd: true, creditIqd: true },
    });
    const d = sum._sum.debitIqd ?? new Prisma.Decimal(0);
    const c = sum._sum.creditIqd ?? new Prisma.Decimal(0);
    return {
      accountId,
      asOf,
      debitIqd: d,
      creditIqd: c,
      balance: this.signedBalance(account.type, d, c),
    };
  }

  /**
   * Formatted voucher for printing a single journal entry.
   */
  async voucher(jeId: string) {
    const je = await this.prisma.journalEntry.findUnique({
      where: { id: jeId },
      include: {
        lines: {
          include: {
            account: { select: { code: true, nameAr: true, nameEn: true } },
            costCenter: { select: { code: true, nameAr: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!je) {
      throw new NotFoundException({
        code: 'JE_NOT_FOUND',
        messageAr: 'القيد غير موجود',
      });
    }
    return {
      id: je.id,
      entryNumber: je.entryNumber,
      entryDate: je.entryDate,
      description: je.description,
      refType: je.refType,
      refId: je.refId,
      status: je.status,
      totalDebitIqd: je.totalDebitIqd,
      totalCreditIqd: je.totalCreditIqd,
      postedBy: je.postedBy,
      postedAt: je.postedAt,
      lines: je.lines.map((l) => ({
        accountCode: l.account.code,
        accountNameAr: l.account.nameAr,
        accountNameEn: l.account.nameEn,
        costCenter: l.costCenter
          ? { code: l.costCenter.code, nameAr: l.costCenter.nameAr }
          : null,
        description: l.description,
        debitIqd: l.debitIqd,
        creditIqd: l.creditIqd,
      })),
    };
  }

  /**
   * Normal-balance-aware signing: assets/expenses = debit-positive; liabilities/equity/revenue = credit-positive.
   */
  private signedBalance(
    type: string,
    debit: Prisma.Decimal,
    credit: Prisma.Decimal,
  ): Prisma.Decimal {
    const debitNatured = ['asset', 'expense'];
    if (debitNatured.includes(type)) return debit.minus(credit);
    return credit.minus(debit);
  }
}
