import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';
import type { DocumentType } from '@erp/shared-types';

// ─── Posting Engine (F2 Philosophy) ──────────────────────────────────────────
// Converts every business transaction into balanced journal entries automatically.
// Rules:
//   - Double-Entry is MANDATORY — DB constraint enforces debit = credit
//   - Posting is IRREVERSIBLE — only reversal (opposite entry) is allowed
//   - Period Lock is ENFORCED — cannot post to closed period
//   - Hash Chain is MAINTAINED on every journal entry

export interface PostingLine {
  accountId: string;
  accountCode: string;
  accountNameAr: string;
  side: 'debit' | 'credit';
  amountIqd: number;
  amountForeign?: number;
  foreignCurrency?: string;
  exchangeRate?: number;
  costCenterId?: string;
  description?: string;
}

export interface PostingRequest {
  companyId: string;
  companyCode: string;
  branchCode?: string;
  periodId: string;
  entryDate: Date;
  description: string;
  referenceType: DocumentType;
  referenceId: string;
  lines: PostingLine[];
  postedBy: string;
  // For using posting profile templates
  profileType?: DocumentType;
}

export interface PostingResult {
  journalEntryId: string;
  entryNumber: string;
  totalDebitIqd: number;
}

@Injectable()
export class PostingService {
  private readonly logger = new Logger(PostingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
  ) {}

  /**
   * Pragmatic alias used by Wave 2-6 services. Accepts a simpler shape:
   *   { companyId, entryDate, refType, refId, description, lines: [{accountCode, debit?, credit?, description?, costCenterId?}] }
   * Resolves period + company code + accountIds from DB.
   * Returns `{ id }` for compatibility with agent-written code.
   */
  async postJournalEntry(
    params: {
      companyId: string;
      branchId?: string;
      entryDate: Date;
      refType: string;
      refId: string;
      description: string;
      lines: Array<{
        accountCode: string;
        debit?: number | Prisma.Decimal;
        credit?: number | Prisma.Decimal;
        description?: string;
        costCenterId?: string;
      }>;
    },
    session: { userId: string },
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string; entryNumber: string }> {
    const client = (tx ?? this.prisma) as any;
    const company = await client.company.findUnique({
      where: { id: params.companyId },
      select: { code: true },
    });
    let branchCode: string | undefined;
    if (params.branchId) {
      const b = await client.branch.findUnique({
        where: { id: params.branchId },
        select: { code: true },
      });
      branchCode = b?.code;
    }
    // Resolve period for entryDate
    const year = params.entryDate.getFullYear();
    const month = params.entryDate.getMonth() + 1;
    const period = await client.accountingPeriod.findFirst({
      where: { companyId: params.companyId, periodYear: year, periodMonth: month },
      select: { id: true },
    });

    // Resolve account IDs by code (fetch all in one go)
    const codes = Array.from(new Set(params.lines.map((l) => l.accountCode)));
    const accounts = await client.chartOfAccount.findMany({
      where: { companyId: params.companyId, code: { in: codes } },
      select: { id: true, code: true, nameAr: true },
    });
    const accMap = new Map<string, { id: string; nameAr: string }>();
    for (const a of accounts) accMap.set(a.code, { id: a.id, nameAr: a.nameAr });

    const lines: PostingLine[] = params.lines.map((l) => {
      const acc = accMap.get(l.accountCode);
      if (!acc) {
        throw new BadRequestException({
          code: 'ACCOUNT_NOT_FOUND',
          messageAr: `الحساب ${l.accountCode} غير موجود`,
        });
      }
      const debit = l.debit ? Number(l.debit) : 0;
      const credit = l.credit ? Number(l.credit) : 0;
      return {
        accountId: acc.id,
        accountCode: l.accountCode,
        accountNameAr: acc.nameAr,
        side: debit > 0 ? 'debit' : 'credit',
        amountIqd: debit > 0 ? debit : credit,
        description: l.description,
        costCenterId: l.costCenterId,
      };
    });

    const result = await this.post({
      companyId: params.companyId,
      companyCode: company?.code ?? 'XXX',
      branchCode,
      periodId: period?.id ?? '',
      entryDate: params.entryDate,
      description: params.description,
      referenceType: params.refType as DocumentType,
      referenceId: params.refId,
      lines,
      postedBy: session.userId,
    }, tx);

    return { id: result.journalEntryId, entryNumber: result.entryNumber };
  }

  /**
   * Post a journal entry.
   * Validates: balanced entry, open period, valid accounts.
   * This is the ONLY way to create journal entries.
   */
  async post(req: PostingRequest, tx?: Prisma.TransactionClient): Promise<PostingResult> {
    // ─── 1. Validate balance (Tier 3 rule — fastest check) ────────────────
    const totalDebit  = req.lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amountIqd, 0);
    const totalCredit = req.lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amountIqd, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new BadRequestException(
        `Journal entry is not balanced: Debit ${totalDebit} ≠ Credit ${totalCredit}`,
      );
    }

    if (totalDebit === 0) {
      throw new BadRequestException('Journal entry cannot have zero amount');
    }

    // ─── 2. Validate period is open ────────────────────────────────────────
    const period = await (tx ?? this.prisma).accountingPeriod.findUnique({
      where: { id: req.periodId },
      select: { status: true, year: true, month: true },
    });

    if (!period) {
      throw new BadRequestException(`Accounting period not found: ${req.periodId}`);
    }

    if (period.status !== 'open') {
      throw new BadRequestException(
        `Cannot post to a ${period.status} period (${period.year}-${period.month})`,
      );
    }

    // ─── 3. Generate entry number ──────────────────────────────────────────
    const entryNumber = await this.sequence.nextNumber({
      companyId:   req.companyId,
      companyCode: req.companyCode,
      branchCode:  req.branchCode,
      prefix:      'JE',
    });

    // ─── 4. Compute hash chain ─────────────────────────────────────────────
    const db = tx ?? this.prisma;
    const lastEntry = await db.journalEntry.findFirst({
      where: { companyId: req.companyId },
      orderBy: { createdAt: 'desc' },
      select: { hash: true },
    });

    const previousHash = lastEntry?.hash ?? '0'.repeat(64);
    const hashInput = [
      previousHash,
      req.companyId,
      entryNumber,
      req.entryDate.toISOString(),
      totalDebit.toString(),
      req.referenceType,
      req.referenceId,
    ].join('|');

    const hash = createHash('sha256').update(hashInput).digest('hex');

    // ─── 5. Create journal entry + lines ──────────────────────────────────
    const entry = await db.journalEntry.create({
      data: {
        companyId:     req.companyId,
        periodId:      req.periodId,
        entryNumber,
        entryDate:     req.entryDate,
        description:   req.description,
        referenceType: req.referenceType,
        referenceId:   req.referenceId,
        totalDebitIqd:  new Prisma.Decimal(totalDebit),
        totalCreditIqd: new Prisma.Decimal(totalCredit),
        status:        'posted',
        postedAt:      new Date(),
        postedBy:      req.postedBy,
        createdBy:     req.postedBy,
        hash,
        previousHash,
        lines: {
          create: req.lines.map((line, idx) => ({
            lineNumber:      idx + 1,
            accountId:       line.accountId,
            accountCode:     line.accountCode,
            accountNameAr:   line.accountNameAr,
            side:            line.side,
            amountIqd:       new Prisma.Decimal(line.amountIqd),
            amountForeign:   line.amountForeign ? new Prisma.Decimal(line.amountForeign) : null,
            foreignCurrency: line.foreignCurrency,
            exchangeRate:    new Prisma.Decimal(line.exchangeRate ?? 1),
            costCenterId:    line.costCenterId,
            description:     line.description,
          })),
        },
      },
    });

    this.logger.log(`Posted: ${entryNumber} | ${totalDebit} IQD | ${req.referenceType}`);

    return {
      journalEntryId: entry.id,
      entryNumber,
      totalDebitIqd: totalDebit,
    };
  }

  /**
   * Reverse a posted journal entry.
   * Creates a mirror entry with opposite sides.
   * The original entry is never modified.
   */
  async reverse(params: {
    journalEntryId: string;
    companyId: string;
    companyCode: string;
    reason: string;
    reversedBy: string;
    reverseDate: Date;
    periodId: string;
    branchCode?: string;
  }): Promise<PostingResult> {
    const original = await this.prisma.journalEntry.findUniqueOrThrow({
      where: { id: params.journalEntryId },
      include: { lines: true },
    });

    if (original.status === 'reversed') {
      throw new BadRequestException('This journal entry has already been reversed');
    }

    if (original.status !== 'posted') {
      throw new BadRequestException('Only posted entries can be reversed');
    }

    // Create reversed lines (flip debit <-> credit)
    const reversedLines: PostingLine[] = original.lines.map(line => ({
      accountId:       line.accountId,
      accountCode:     line.accountCode,
      accountNameAr:   line.accountNameAr,
      side:            line.side === 'debit' ? 'credit' : 'debit',
      amountIqd:       Number(line.amountIqd),
      costCenterId:    line.costCenterId ?? undefined,
      description:     `عكس: ${line.description ?? ''}`,
    }));

    return this.prisma.$transaction(async (tx) => {
      // Create reversal entry
      const result = await this.post({
        companyId:     params.companyId,
        companyCode:   params.companyCode,
        branchCode:    params.branchCode,
        periodId:      params.periodId,
        entryDate:     params.reverseDate,
        description:   `عكس القيد ${original.entryNumber} — ${params.reason}`,
        referenceType: original.referenceType as DocumentType,
        referenceId:   original.referenceId,
        lines:         reversedLines,
        postedBy:      params.reversedBy,
      }, tx);

      // Mark original as reversed
      await tx.journalEntry.update({
        where: { id: params.journalEntryId },
        data: {
          status:      'reversed',
          reversedById: result.journalEntryId,
        },
      });

      return result;
    });
  }

  /**
   * Lookup and apply a posting profile (template).
   * Returns pre-filled posting lines based on the document type.
   */
  async getProfileLines(params: {
    companyId: string;
    branchId: string | null;
    transactionType: DocumentType;
  }): Promise<{ debitAccountId: string; creditAccountId: string; secondaryEntries?: unknown } | null> {
    const profile = await this.prisma.postingProfile.findFirst({
      where: {
        companyId:       params.companyId,
        transactionType: params.transactionType,
        isActive:        true,
        OR: [
          { branchId: params.branchId },
          { branchId: null },
        ],
      },
      orderBy: { branchId: 'desc' }, // branch-specific takes priority over null
    });

    if (!profile) return null;

    return {
      debitAccountId:   profile.debitAccountId,
      creditAccountId:  profile.creditAccountId,
      secondaryEntries: profile.secondaryEntries,
    };
  }
}
