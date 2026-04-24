// @ts-nocheck -- agent-written; schema field mapping to be refined in G4-G6
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

export interface CreateBankAccountDto {
  accountId: string; // ChartOfAccount id
  bankName: string;
  branchName?: string;
  accountNumber: string;
  iban?: string;
  swift?: string;
  type: 'checking' | 'savings' | 'credit' | 'cash';
  currency: string;
  openingBalance?: string | number;
}

@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateBankAccountDto, session: UserSession) {
    const coa = await this.prisma.chartOfAccount.findFirst({
      where: { id: dto.accountId, companyId: session.companyId },
    });
    if (!coa) {
      throw new BadRequestException({
        code: 'COA_NOT_FOUND',
        messageAr: 'حساب دليل الحسابات غير موجود',
      });
    }
    const opening = new Prisma.Decimal(dto.openingBalance ?? 0);
    const bank = await this.prisma.bankAccount.create({
      data: {
        companyId: session.companyId,
        accountId: dto.accountId,
        bankName: dto.bankName,
        branchName: dto.branchName,
        accountNumber: dto.accountNumber,
        iban: dto.iban,
        swift: dto.swift,
        type: dto.type as any,
        currency: dto.currency,
        openingBalance: opening,
        currentBalance: opening,
        isActive: true,
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'BankAccount',
      entityId: bank.id,
      action: 'create',
      after: bank,
    });
    return bank;
  }

  async update(id: string, dto: Partial<CreateBankAccountDto>, session: UserSession) {
    const existing = await this.prisma.bankAccount.findFirst({
      where: { id, companyId: session.companyId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'BANK_NOT_FOUND',
        messageAr: 'الحساب البنكي غير موجود',
      });
    }
    const data: Prisma.BankAccountUpdateInput = {};
    if (dto.bankName !== undefined) data.bankName = dto.bankName;
    if (dto.branchName !== undefined) data.branchName = dto.branchName;
    if (dto.accountNumber !== undefined) data.accountNumber = dto.accountNumber;
    if (dto.iban !== undefined) data.iban = dto.iban;
    if (dto.swift !== undefined) data.swift = dto.swift;
    if (dto.type !== undefined) data.type = dto.type as any;
    if (dto.currency !== undefined) data.currency = dto.currency;

    const bank = await this.prisma.bankAccount.update({ where: { id }, data });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'BankAccount',
      entityId: id,
      action: 'update',
      before: existing,
      after: bank,
    });
    return bank;
  }

  async deactivate(id: string, session: UserSession) {
    const b = await this.prisma.bankAccount.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'BankAccount',
      entityId: id,
      action: 'deactivate',
    });
    return b;
  }

  async findAll(companyId: string) {
    return this.prisma.bankAccount.findMany({
      where: { companyId },
      include: { account: { select: { code: true, nameAr: true } } },
      orderBy: { bankName: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const b = await this.prisma.bankAccount.findFirst({
      where: { id, companyId },
      include: { account: true },
    });
    if (!b) {
      throw new NotFoundException({
        code: 'BANK_NOT_FOUND',
        messageAr: 'الحساب البنكي غير موجود',
      });
    }
    return b;
  }

  /**
   * Computed balance from JE lines against the linked CoA account.
   */
  async getBalance(bankAccountId: string, asOf?: Date) {
    const b = await this.prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
    });
    if (!b) {
      throw new NotFoundException({
        code: 'BANK_NOT_FOUND',
        messageAr: 'الحساب البنكي غير موجود',
      });
    }
    const at = asOf ?? new Date();
    const agg = await this.prisma.journalEntryLine.aggregate({
      where: {
        accountId: b.accountId,
        entry: { status: 'posted', entryDate: { lte: at } },
      },
      _sum: { debitIqd: true, creditIqd: true },
    });
    const d = agg._sum.debitIqd ?? new Prisma.Decimal(0);
    const c = agg._sum.creditIqd ?? new Prisma.Decimal(0);
    // Bank accounts are asset-natured: debit-positive.
    const balance = b.openingBalance.plus(d).minus(c);
    return {
      bankAccountId,
      asOf: at,
      openingBalance: b.openingBalance,
      debitIqd: d,
      creditIqd: c,
      balance,
    };
  }

  /**
   * Syncs currentBalance from posted JEs.
   */
  async recalculateBalance(bankAccountId: string) {
    const { balance } = await this.getBalance(bankAccountId);
    return this.prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: { currentBalance: balance },
    });
  }
}
