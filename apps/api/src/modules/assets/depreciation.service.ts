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
    });

    const accountIds = Array.from(
      new Set(
        assets.flatMap((a) => [a.depreciationExpenseAccountId, a.accumDepAccountId]),
      ),
    );
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, code: true },
    });
    const accCode = new Map(accounts.map((a) => [a.id, a.code]));

    const periodDate = new Date(year, month, 0); // last day of month
    const results: Array<{ assetId: string; depreciation: string }> = [];

    for (const asset of assets) {
      const existing = await this.prisma.assetDepreciation.findFirst({
        where: { assetId: asset.id, periodYear: year, periodMonth: month },
      });
      if (existing) continue;

      const dep = this.computeDepreciation(asset);
      if (dep.lte(0)) continue;

      const potentialAccum = asset.accumulatedDepIqd.plus(dep);
      const maxAccum = asset.purchaseCostIqd.minus(asset.salvageValueIqd);
      const actualDep = potentialAccum.gt(maxAccum)
        ? maxAccum.minus(asset.accumulatedDepIqd)
        : dep;
      if (actualDep.lte(0)) continue;

      const newAccum = asset.accumulatedDepIqd.plus(actualDep);
      const newBook = asset.purchaseCostIqd.minus(newAccum);

      const expCode = accCode.get(asset.depreciationExpenseAccountId);
      const accumCodeStr = accCode.get(asset.accumDepAccountId);
      if (!expCode || !accumCodeStr) {
        throw new BadRequestException({
          code: 'ASSET_COA_MISSING',
          messageAr: `حسابات الإهلاك غير مكتملة للأصل ${asset.number}`,
        });
      }

      await this.prisma.$transaction(async (tx) => {
        const je = await this.posting.postJournalEntry(
          {
            companyId,
            branchId: asset.branchId,
            entryDate: periodDate,
            refType: 'AssetDepreciation',
            refId: `${asset.id}-${year}-${month}`,
            description: `Depreciation ${year}-${String(month).padStart(2, '0')} ${asset.number}`,
            lines: [
              { accountCode: expCode, debit: actualDep.toNumber(), description: asset.nameAr },
              { accountCode: accumCodeStr, credit: actualDep.toNumber(), description: asset.nameAr },
            ],
          },
          { userId: session.userId },
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
    });
    if (!asset) {
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        messageAr: 'الأصل غير موجود',
      });
    }

    const [accumCoa, expCoa] = await Promise.all([
      this.prisma.chartOfAccount.findUnique({ where: { id: asset.accumDepAccountId } }),
      this.prisma.chartOfAccount.findUnique({ where: { id: asset.depreciationExpenseAccountId } }),
    ]);
    if (!accumCoa || !expCoa) {
      throw new BadRequestException({
        code: 'ASSET_COA_MISSING',
        messageAr: 'حسابات الإهلاك غير مكتملة',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await this.posting.postJournalEntry(
        {
          companyId: session.companyId,
          branchId: asset.branchId,
          entryDate: new Date(),
          refType: 'AssetDepreciationReversal',
          refId: `${assetId}-${year}-${month}`,
          description: `Reversal of depreciation ${year}-${month} for ${asset.number}: ${reason}`,
          lines: [
            { accountCode: accumCoa.code, debit: dep.depreciationIqd.toNumber() },
            { accountCode: expCoa.code, credit: dep.depreciationIqd.toNumber() },
          ],
        },
        { userId: session.userId },
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
        depreciationEntries: {
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

    const past = asset.depreciationEntries.map((d) => ({
      year: d.periodYear,
      month: d.periodMonth,
      depreciationIqd: d.depreciationIqd,
      accumulatedIqd: d.accumulatedIqd,
      bookValueIqd: d.bookValueIqd,
      posted: true,
    }));

    const future: Array<{
      year: number;
      month: number;
      depreciationIqd: Prisma.Decimal;
      accumulatedIqd: Prisma.Decimal;
      bookValueIqd: Prisma.Decimal;
      posted: boolean;
    }> = [];
    let accum = asset.accumulatedDepIqd;
    let book = asset.bookValueIqd;
    const maxAccum = asset.purchaseCostIqd.minus(asset.salvageValueIqd);
    const startDate = new Date(asset.acquisitionDate);
    const lastPosted = asset.depreciationEntries.length
      ? asset.depreciationEntries[asset.depreciationEntries.length - 1]
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
        const rate = new Prisma.Decimal(2).div(asset.usefulLifeMonths);
        const dep = book.mul(rate);
        const min = asset.salvageValueIqd;
        if (book.minus(dep).lt(min)) return book.minus(min);
        return dep;
      }
      case 'units_of_production':
        return asset.monthlyDepIqd;
      case 'straight_line':
      default:
        return asset.monthlyDepIqd;
    }
  }
}
