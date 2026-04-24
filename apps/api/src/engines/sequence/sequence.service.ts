import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';

// ─── Sequence Engine ──────────────────────────────────────────────────────────
// Generates human-readable, unique, sequential document numbers.
// Format: {PREFIX}-{COMPANY}-{BRANCH}-{YEAR}-{SEQ:6}
// Example: INV-RUA-BGD-2026-000125
//
// Rules:
//  - Atomic increment via DB transaction (no gaps under concurrent writes)
//  - ULID is used for primary keys — this is for HUMAN-READABLE document numbers only
//  - Per company + branch + prefix + year
//  - Works offline: POS uses a local SQLite sequence, synced back as a range

export type DocumentPrefix =
  | 'INV'  // Sales Invoice
  | 'SO'   // Sales Order
  | 'QT'   // Quotation
  | 'RET'  // Sales Return
  | 'PO'   // Purchase Order
  | 'GRN'  // Goods Receipt Note
  | 'PRet' // Purchase Return
  | 'DO'   // Delivery Order
  | 'JE'   // Journal Entry
  | 'RV'   // Receipt Voucher (قبض)
  | 'PV'   // Payment Voucher (صرف)
  | 'ST'   // Stock Transfer
  | 'SC'   // Stocktaking Session
  | 'JO'   // Job Order (Custom)
  | 'HR'   // Salary Run
  | 'EXP'  // Expense Claim
  | 'LIC'; // License

export interface SequenceParams {
  companyCode: string;
  branchCode?: string;
  prefix: DocumentPrefix;
  companyId: string;
  branchId?: string;
  year?: number;
}

@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate the next document number.
   * Uses SELECT ... FOR UPDATE to ensure atomic increment.
   */
  async nextNumber(params: SequenceParams): Promise<string> {
    const year = params.year ?? new Date().getFullYear();
    const branchId = params.branchId ?? null;

    // Atomic increment via transaction + row lock
    const result = await this.prisma.$transaction(async (tx) => {
      // Upsert the sequence counter
      const seq = await tx.$executeRaw`
        INSERT INTO document_sequences ("id", "companyId", "branchId", "prefix", "year", "lastValue", "updatedAt")
        VALUES (
          gen_ulid(),
          ${params.companyId}::char(26),
          ${branchId}::char(26),
          ${params.prefix},
          ${year},
          1,
          NOW()
        )
        ON CONFLICT ("companyId", "branchId", "prefix", "year")
        DO UPDATE SET
          "lastValue" = document_sequences."lastValue" + 1,
          "updatedAt" = NOW()
        RETURNING "lastValue"
      `;

      // Read back the current value
      const row = await tx.documentSequence.findUniqueOrThrow({
        where: {
          companyId_branchId_prefix_year: {
            companyId: params.companyId,
            branchId: branchId as string,
            prefix: params.prefix,
            year,
          },
        },
        select: { lastValue: true },
      });

      return row.lastValue;
    });

    return this.formatNumber(params, year, result);
  }

  /**
   * Format: INV-RUA-BGD-2026-000125
   */
  private formatNumber(params: SequenceParams, year: number, seq: number): string {
    const parts: string[] = [params.prefix, params.companyCode];
    if (params.branchCode) parts.push(params.branchCode);
    parts.push(String(year));
    parts.push(String(seq).padStart(6, '0'));
    return parts.join('-');
  }

  /**
   * Reserve a range of numbers for offline POS use.
   * Returns the first and last numbers in the range.
   */
  async reserveRange(params: SequenceParams, count: number): Promise<{ from: number; to: number }> {
    const year = params.year ?? new Date().getFullYear();
    const branchId = params.branchId ?? null;

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.$queryRaw<{ lastValue: number }[]>`
        INSERT INTO document_sequences ("id", "companyId", "branchId", "prefix", "year", "lastValue", "updatedAt")
        VALUES (gen_ulid(), ${params.companyId}::char(26), ${branchId}::char(26), ${params.prefix}, ${year}, ${count}, NOW())
        ON CONFLICT ("companyId", "branchId", "prefix", "year")
        DO UPDATE SET
          "lastValue" = document_sequences."lastValue" + ${count},
          "updatedAt" = NOW()
        RETURNING "lastValue"
      `;
      return row[0].lastValue;
    });

    return { from: result - count + 1, to: result };
  }
}
