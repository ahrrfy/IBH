import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { Prisma, AccountCategory, AccountType } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

export interface CreateAccountDto {
  code: string;
  nameAr: string;
  nameEn?: string;
  category: AccountCategory;
  accountType: AccountType;
  parentId?: string | null;
  isHeader?: boolean;
  allowDirectPosting?: boolean;
  currency?: string;
}

export interface UpdateAccountDto {
  nameAr?: string;
  nameEn?: string;
  category?: AccountCategory;
  accountType?: AccountType;
  parentId?: string | null;
  isHeader?: boolean;
  isActive?: boolean;
  allowDirectPosting?: boolean;
}

@Injectable()
export class GLService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Chart of Accounts ─────────────────────────────────────────────────────

  async listAccounts(
    companyId: string,
    opts: { category?: string; activeOnly?: boolean } = {},
  ) {
    return this.prisma.chartOfAccount.findMany({
      where: {
        companyId,
        ...(opts.category ? { category: opts.category as AccountCategory } : {}),
        ...(opts.activeOnly ? { isActive: true } : {}),
      },
      orderBy: { code: 'asc' },
    });
  }

  async getAccount(id: string, companyId: string) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id, companyId },
      include: { parent: { select: { id: true, code: true, nameAr: true } } },
    });
    if (!account) {
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        messageAr: 'الحساب غير موجود',
      });
    }
    return account;
  }

  async createAccount(
    companyId: string,
    dto: CreateAccountDto,
    session: UserSession,
  ) {
    const existing = await this.prisma.chartOfAccount.findFirst({
      where: { companyId, code: dto.code },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'CODE_EXISTS',
        messageAr: 'كود الحساب مستخدم سابقاً',
      });
    }

    if (dto.parentId) {
      const parent = await this.prisma.chartOfAccount.findFirst({
        where: { id: dto.parentId, companyId },
      });
      if (!parent) {
        throw new BadRequestException({
          code: 'PARENT_NOT_FOUND',
          messageAr: 'الحساب الأب غير موجود',
        });
      }
      if (parent.category !== dto.category) {
        throw new BadRequestException({
          code: 'CATEGORY_MISMATCH',
          messageAr: 'تصنيف الحساب يجب أن يطابق الحساب الأب',
        });
      }
    }

    return this.prisma.chartOfAccount.create({
      data: {
        companyId,
        code: dto.code,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        category: dto.category,
        accountType: dto.accountType,
        parentId: dto.parentId ?? null,
        isHeader: dto.isHeader ?? false,
        allowDirectPosting: dto.allowDirectPosting ?? true,
        currency: dto.currency ?? 'IQD',
        createdBy: session.userId,
      },
    });
  }

  async updateAccount(
    id: string,
    companyId: string,
    dto: UpdateAccountDto,
    _session: UserSession,
  ) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id, companyId },
    });
    if (!account) {
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        messageAr: 'الحساب غير موجود',
      });
    }

    if (
      (dto.category !== undefined && dto.category !== account.category) ||
      (dto.accountType !== undefined && dto.accountType !== account.accountType)
    ) {
      const usage = await this.prisma.journalEntryLine.count({
        where: { accountId: id },
      });
      if (usage > 0) {
        throw new BadRequestException({
          code: 'ACCOUNT_IN_USE',
          messageAr: 'لا يمكن تغيير تصنيف حساب مستخدم في قيود',
        });
      }
    }

    if (dto.parentId !== undefined && dto.parentId !== null && dto.parentId !== account.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException({
          code: 'SELF_PARENT',
          messageAr: 'لا يمكن أن يكون الحساب أباً لنفسه',
        });
      }
      const parent = await this.prisma.chartOfAccount.findFirst({
        where: { id: dto.parentId, companyId },
      });
      if (!parent) {
        throw new BadRequestException({
          code: 'PARENT_NOT_FOUND',
          messageAr: 'الحساب الأب غير موجود',
        });
      }
      const targetCat = dto.category ?? account.category;
      if (parent.category !== targetCat) {
        throw new BadRequestException({
          code: 'CATEGORY_MISMATCH',
          messageAr: 'تصنيف الحساب يجب أن يطابق الحساب الأب',
        });
      }
    }

    return this.prisma.chartOfAccount.update({
      where: { id },
      data: {
        ...(dto.nameAr !== undefined && { nameAr: dto.nameAr }),
        ...(dto.nameEn !== undefined && { nameEn: dto.nameEn }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.accountType !== undefined && { accountType: dto.accountType }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.isHeader !== undefined && { isHeader: dto.isHeader }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.allowDirectPosting !== undefined && {
          allowDirectPosting: dto.allowDirectPosting,
        }),
      },
    });
  }

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
        journalEntry: whereEntry,
      },
      include: {
        journalEntry: {
          select: {
            id: true,
            entryNumber: true,
            entryDate: true,
            description: true,
            referenceType: true,
            referenceId: true,
          },
        },
      },
      orderBy: [
        { journalEntry: { entryDate: 'asc' } },
        { journalEntry: { entryNumber: 'asc' } },
        { lineNumber: 'asc' },
      ],
    });

    let openingBalance = new Prisma.Decimal(0);
    if (params.from) {
      const [pd, pc] = await Promise.all([
        this.prisma.journalEntryLine.aggregate({
          where: {
            accountId,
            side: 'debit',
            journalEntry: {
              companyId,
              status: 'posted',
              entryDate: { lt: params.from },
            },
          },
          _sum: { amountIqd: true },
        }),
        this.prisma.journalEntryLine.aggregate({
          where: {
            accountId,
            side: 'credit',
            journalEntry: {
              companyId,
              status: 'posted',
              entryDate: { lt: params.from },
            },
          },
          _sum: { amountIqd: true },
        }),
      ]);
      const d = pd._sum.amountIqd ?? new Prisma.Decimal(0);
      const c = pc._sum.amountIqd ?? new Prisma.Decimal(0);
      openingBalance = this.signedBalance(account.category, d, c);
    }

    let running = openingBalance;
    const rows = lines.map((l) => {
      const debit = l.side === 'debit' ? l.amountIqd : new Prisma.Decimal(0);
      const credit = l.side === 'credit' ? l.amountIqd : new Prisma.Decimal(0);
      const signed = this.signedBalance(account.category, debit, credit);
      running = running.plus(signed);
      return {
        entryId: l.journalEntry.id,
        entryNumber: l.journalEntry.entryNumber,
        entryDate: l.journalEntry.entryDate,
        description: l.description ?? l.journalEntry.description,
        referenceType: l.journalEntry.referenceType,
        referenceId: l.journalEntry.referenceId,
        debitIqd: debit,
        creditIqd: credit,
        balance: running,
      };
    });

    return {
      account: {
        id: account.id,
        code: account.code,
        nameAr: account.nameAr,
        nameEn: account.nameEn,
        category: account.category,
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
      by: ['accountId', 'side'],
      where: {
        journalEntry: {
          companyId,
          status: 'posted',
          entryDate: { lte: asOf },
        },
      },
      _sum: { amountIqd: true },
    });

    const sumMap = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    for (const s of sums) {
      const cur = sumMap.get(s.accountId) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      const amt = s._sum.amountIqd ?? new Prisma.Decimal(0);
      if (s.side === 'debit') cur.debit = cur.debit.plus(amt);
      else cur.credit = cur.credit.plus(amt);
      sumMap.set(s.accountId, cur);
    }

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    const lines = accounts.map((a) => {
      const s = sumMap.get(a.id) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      totalDebit = totalDebit.plus(s.debit);
      totalCredit = totalCredit.plus(s.credit);
      const balance = this.signedBalance(a.category, s.debit, s.credit);
      return {
        accountId: a.id,
        code: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        category: a.category,
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
        journalEntry: {
          companyId,
          status: 'posted',
          entryDate: { gte: params.from, lte: params.to },
        },
        ...(params.costCenterId ? { costCenterId: params.costCenterId } : {}),
      },
      include: {
        journalEntry: {
          select: { id: true, entryNumber: true, entryDate: true, description: true },
        },
      },
      orderBy: [
        { accountCode: 'asc' },
        { journalEntry: { entryDate: 'asc' } },
      ],
    });

    const grouped = new Map<
      string,
      {
        account: { id: string; code: string; nameAr: string };
        lines: Array<{
          entryId: string;
          entryNumber: string;
          entryDate: Date;
          description: string | null;
          debitIqd: Prisma.Decimal;
          creditIqd: Prisma.Decimal;
        }>;
      }
    >();
    for (const l of lines) {
      const key = l.accountId;
      if (!grouped.has(key)) {
        grouped.set(key, {
          account: { id: l.accountId, code: l.accountCode, nameAr: l.accountNameAr },
          lines: [],
        });
      }
      const debit = l.side === 'debit' ? l.amountIqd : new Prisma.Decimal(0);
      const credit = l.side === 'credit' ? l.amountIqd : new Prisma.Decimal(0);
      grouped.get(key)!.lines.push({
        entryId: l.journalEntry.id,
        entryNumber: l.journalEntry.entryNumber,
        entryDate: l.journalEntry.entryDate,
        description: l.description ?? l.journalEntry.description,
        debitIqd: debit,
        creditIqd: credit,
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
    const [debitAgg, creditAgg] = await Promise.all([
      this.prisma.journalEntryLine.aggregate({
        where: {
          accountId,
          side: 'debit',
          journalEntry: { status: 'posted', entryDate: { lte: asOf } },
        },
        _sum: { amountIqd: true },
      }),
      this.prisma.journalEntryLine.aggregate({
        where: {
          accountId,
          side: 'credit',
          journalEntry: { status: 'posted', entryDate: { lte: asOf } },
        },
        _sum: { amountIqd: true },
      }),
    ]);
    const d = debitAgg._sum.amountIqd ?? new Prisma.Decimal(0);
    const c = creditAgg._sum.amountIqd ?? new Prisma.Decimal(0);
    return {
      accountId,
      asOf,
      debitIqd: d,
      creditIqd: c,
      balance: this.signedBalance(account.category, d, c),
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
          orderBy: { lineNumber: 'asc' },
        },
      },
    });
    if (!je) {
      throw new NotFoundException({
        code: 'JE_NOT_FOUND',
        messageAr: 'القيد غير موجود',
      });
    }

    const costCenterIds = Array.from(
      new Set(je.lines.map((l) => l.costCenterId).filter((x): x is string => !!x)),
    );
    const costCenters = costCenterIds.length
      ? await this.prisma.costCenter.findMany({
          where: { id: { in: costCenterIds } },
          select: { id: true, code: true, nameAr: true },
        })
      : [];
    const ccMap = new Map(costCenters.map((c) => [c.id, c]));

    const accountIds = Array.from(new Set(je.lines.map((l) => l.accountId)));
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, nameEn: true },
    });
    const accMap = new Map(accounts.map((a) => [a.id, a]));

    return {
      id: je.id,
      entryNumber: je.entryNumber,
      entryDate: je.entryDate,
      description: je.description,
      referenceType: je.referenceType,
      referenceId: je.referenceId,
      status: je.status,
      totalDebitIqd: je.totalDebitIqd,
      totalCreditIqd: je.totalCreditIqd,
      postedBy: je.postedBy,
      postedAt: je.postedAt,
      lines: je.lines.map((l) => ({
        accountCode: l.accountCode,
        accountNameAr: l.accountNameAr,
        accountNameEn: accMap.get(l.accountId)?.nameEn ?? null,
        costCenter: l.costCenterId
          ? ccMap.get(l.costCenterId)
            ? {
                code: ccMap.get(l.costCenterId)!.code,
                nameAr: ccMap.get(l.costCenterId)!.nameAr,
              }
            : null
          : null,
        description: l.description,
        debitIqd: l.side === 'debit' ? l.amountIqd : new Prisma.Decimal(0),
        creditIqd: l.side === 'credit' ? l.amountIqd : new Prisma.Decimal(0),
      })),
    };
  }

  /**
   * Normal-balance-aware signing by AccountCategory:
   *   debit-natured (assets, expenses) = debit - credit
   *   credit-natured (liabilities, equity, revenue) = credit - debit
   */
  private signedBalance(
    category: string,
    debit: Prisma.Decimal,
    credit: Prisma.Decimal,
  ): Prisma.Decimal {
    const debitNatured = ['fixed_assets', 'current_assets', 'expense'];
    if (debitNatured.includes(category)) return debit.minus(credit);
    return credit.minus(debit);
  }
}
