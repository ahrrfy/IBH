import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AuditService } from '../../engines/audit/audit.service';
import { PostingService } from '../../engines/posting/posting.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

@Injectable()
export class DepreciationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: PostingService,
  ) {}

  /**
   * Generates depreciation for all active assets for a given period.
   * For each asset without an existing AssetDepreciation row for (year, month):
   *   - compute depreciation per method
   *   - update accumulated + book value
   *   - post JE: Dr depreciation expense / Cr accumulated depreciation
   */
  async generateMonthlyDepreciation(
    companyId: string,
    year: number,
    month: number,
    session: UserSession,
  ) {
    const assets = await this.prisma.fixedAsset.findMany({
      where: { companyId, status: 'active' as any },
      include: {
        depreciationExpenseAccount: true,
        accumDepAccount: true,
      },
    });

    const periodDate = new Date(year, month, 0); // last day of month

    const results: Array<{ assetId: string; depreciation: string }> = [];

    for (const asset of assets) {
      const existing = await this.prisma.assetDepreciation.findFirst({
        where: { assetId: asset.id, periodYear: year, periodMonth: month },
      });
      if (existing) continue;

      const dep = this.computeDepreciation(asset);
      if (dep.lte(0)) continue;

      // Don't depreciate below salvage
      const potentialAccum = asset.accumulatedDepIqd.plus(dep);
      const maxAccum = asset.purchaseCostIqd.minus(asset.salvageValueIqd);
      const actualDep = potentialAccum.gt(maxAccum)
        ? maxAccum.minus(asset.accumulatedDepIqd)
        : dep;
      if (actualDep.lte(0)) continue;

      const newAccum = asset.accumulatedDepIqd.plus(actualDep);
      const newBook = asset.purchaseCostIqd.minus(newAccum);

      await this.prisma.$transaction(async (tx) => {
        const je = await this.posting.postJournalEntry(
          {
            companyId,
            entryDate: periodDate,
            refType: 'AssetDepreciation',
            refId: `${asset.id}-${year}-${month}`,
            description: `Depreciation ${year}-${String(month).padStart(2, '0')} ${asset.number}`,
            lines: [
              {
                accountCode: asset.depreciationExpenseAccount.code,
                debit: actualDep.toString(),
                description: asset.nameAr,
              },
              {
                accountCode: asset.accumDepAccount.code,
                credit: actualDep.toString(),
                description: asset.nameAr,
              },
            ],
          },
          session,
          tx,
        );

        await tx.assetDepreciation.create({
          data: {
            assetId: asset.id,
            periodYear: year,
            periodMonth: month,
            depreciationIqd: actualDep,
            accumulatedIqd: newAccum,
            bookValueIqd: newBook,
            journalEntryId: je.id,
            postedAt: new Date(),
            postedBy: session.userId,
          },
        });

        await tx.fixedAsset.update({
          where: { id: asset.id },
          data: {
            accumulatedDepIqd: newAccum,
            bookValueIqd: newBook,
          },
        });
      });

      results.push({ assetId: asset.id, depreciation: actualDep.toString() });
    }

    await this.audit.log({
      companyId,
      userId: session.userId,
      entity: 'AssetDepreciation',
      entityId: `${year}-${month}`,
      action: 'generate_monthly',
      after: { count: results.length },
    });

    return { year, month, count: results.length, results };
  }

  /**
   * Reverse a specific month's depreciation. super_admin only.
   */
  async reverseDepreciation(
    assetId: string,
    year: number,
    month: number,
    reason: string,
    session: UserSession,
  ) {
    if (!session.roles?.includes('super_admin')) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        messageAr: 'صلاحية غير كافية',
      });
    }
    const dep = await this.prisma.assetDepreciation.findFirst({
      where: { assetId, periodYear: year, periodMonth: month },
    });
    if (!dep) {
      throw new NotFoundException({
        code: 'DEPRECIATION_NOT_FOUND',
        messageAr: 'سجل الإهلاك غير موجود',
      });
    }
    const asset = await this.prisma.fixedAsset.findUnique({
      where: { id: assetId },
      include: { accumDepAccount: true, depreciationExpenseAccount: true },
    });
    if (!asset) {
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        messageAr: 'الأصل غير موجود',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Reverse JE: Dr Accum / Cr Expense
      await this.posting.postJournalEntry(
        {
          companyId: session.companyId,
          entryDate: new Date(),
          refType: 'AssetDepreciationReversal',
          refId: `${assetId}-${year}-${month}`,
          description: `Reversal of depreciation ${year}-${month} for ${asset.number}: ${reason}`,
          lines: [
            {
              accountCode: asset.accumDepAccount.code,
              debit: dep.depreciationIqd.toString(),
            },
            {
              accountCode: asset.depreciationExpenseAccount.code,
              credit: dep.depreciationIqd.toString(),
            },
          ],
        },
        session,
        tx,
      );

      await tx.fixedAsset.update({
        where: { id: assetId },
        data: {
          accumulatedDepIqd: asset.accumulatedDepIqd.minus(dep.depreciationIqd),
          bookValueIqd: asset.bookValueIqd.plus(dep.depreciationIqd),
        },
      });

      await tx.assetDepreciation.delete({ where: { id: dep.id } });
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'AssetDepreciation',
      entityId: dep.id,
      action: 'reverse',
      after: { reason },
    });

    return { ok: true };
  }

  /**
   * Returns historical (posted) + projected future depreciation rows.
   */
  async depreciationSchedule(assetId: string, companyId: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, companyId },
      include: {
        depreciations: {
          orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
        },
      },
    });
    if (!asset) {
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        messageAr: 'الأصل غير موجود',
      });
    }

    const past = asset.depreciations.map((d) => ({
      year: d.periodYear,
      month: d.periodMonth,
      depreciationIqd: d.depreciationIqd,
      accumulatedIqd: d.accumulatedIqd,
      bookValueIqd: d.bookValueIqd,
      posted: true,
    }));

    // Project future
    const future: Array<any> = [];
    let accum = asset.accumulatedDepIqd;
    let book = asset.bookValueIqd;
    const maxAccum = asset.purchaseCostIqd.minus(asset.salvageValueIqd);
    const startDate = new Date(asset.acquisitionDate);
    const lastPosted = asset.depreciations.length
      ? asset.depreciations[asset.depreciations.length - 1]
      : null;
    const startYear = lastPosted
      ? lastPosted.periodMonth === 12
        ? lastPosted.periodYear + 1
        : lastPosted.periodYear
      : startDate.getFullYear();
    const startMonth = lastPosted
      ? lastPosted.periodMonth === 12
        ? 1
        : lastPosted.periodMonth + 1
      : startDate.getMonth() + 1;

    let y = startYear;
    let m = startMonth;
    let guard = 0;
    while (accum.lt(maxAccum) && guard < asset.usefulLifeMonths + 12) {
      const dep = this.computeDepreciationFor(asset, accum, book);
      if (dep.lte(0)) break;
      const potential = accum.plus(dep);
      const actual = potential.gt(maxAccum) ? maxAccum.minus(accum) : dep;
      accum = accum.plus(actual);
      book = book.minus(actual);
      future.push({
        year: y,
        month: m,
        depreciationIqd: actual,
        accumulatedIqd: accum,
        bookValueIqd: book,
        posted: false,
      });
      m++;
      if (m > 12) { m = 1; y++; }
      guard++;
    }

    return {
      assetId,
      number: asset.number,
      method: asset.depreciationMethod,
      purchaseCostIqd: asset.purchaseCostIqd,
      salvageValueIqd: asset.salvageValueIqd,
      usefulLifeMonths: asset.usefulLifeMonths,
      past,
      future,
    };
  }

  // ---- helpers ----

  private computeDepreciation(asset: {
    depreciationMethod: string;
    monthlyDepIqd: Prisma.Decimal;
    purchaseCostIqd: Prisma.Decimal;
    accumulatedDepIqd: Prisma.Decimal;
    bookValueIqd: Prisma.Decimal;
    salvageValueIqd: Prisma.Decimal;
    usefulLifeMonths: number;
  }): Prisma.Decimal {
    return this.computeDepreciationFor(
      asset,
      asset.accumulatedDepIqd,
      asset.bookValueIqd,
    );
  }

  private computeDepreciationFor(
    asset: {
      depreciationMethod: string;
      monthlyDepIqd: Prisma.Decimal;
      purchaseCostIqd: Prisma.Decimal;
      salvageValueIqd: Prisma.Decimal;
      usefulLifeMonths: number;
    },
    accum: Prisma.Decimal,
    book: Prisma.Decimal,
  ): Prisma.Decimal {
    switch (asset.depreciationMethod) {
      case 'declining_balance': {
        // Double-declining: rate = 2 / usefulLifeMonths
        const rate = new Prisma.Decimal(2).div(asset.usefulLifeMonths);
        const dep = book.mul(rate);
        const min = asset.salvageValueIqd;
        if (book.minus(dep).lt(min)) return book.minus(min);
        return dep;
      }
      case 'units_of_production':
        // Without usage data, fall back to straight-line.
        return asset.monthlyDepIqd;
      case 'straight_line':
      default:
        return asset.monthlyDepIqd;
    }
  }
}
