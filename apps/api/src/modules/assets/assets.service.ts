import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AuditService } from '../../engines/audit/audit.service';
import { SequenceService } from '../../engines/sequence/sequence.service';
import { PostingService } from '../../engines/posting/posting.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

export interface CreateAssetDto {
  nameAr: string;
  categoryAccountId: string;
  accumDepAccountId: string;
  depreciationExpenseAccountId: string;
  acquisitionDate: string | Date;
  purchaseCostIqd: string | number;
  salvageValueIqd?: string | number;
  usefulLifeMonths: number;
  depreciationMethod?: 'straight_line' | 'declining_balance' | 'units_of_production';
  costCenterId?: string;
  vendorId?: string;
  warrantyUntil?: string | Date;
  serialNumber?: string;
  location?: string;
  assignedTo?: string;
  fundingSource?: 'cash' | 'ap';
  cashAccountCode?: string; // when fundingSource = cash, defaults to '2411' (Main Branch Cash)
  apAccountCode?: string;   // when fundingSource = ap, defaults to '321' (Trade AP)
}

export interface RecordMaintenanceDto {
  assetId: string;
  date: string | Date;
  type: string;
  description: string;
  costIqd: string | number;
  isCapital: boolean;
  cashAccountCode?: string; // defaults to '2411'
  maintenanceExpenseAccountCode?: string; // defaults to '636' (General Maintenance)
}

export interface DisposeAssetDto {
  assetId: string;
  method: 'sold' | 'written_off' | 'scrapped';
  saleValueIqd?: string | number;
  cashAccountCode?: string; // default '2411'
  gainAccountCode?: string; // default '593' (Misc Income)
  lossAccountCode?: string; // default '69' (Misc Expense)
}

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
  ) {}

  async create(dto: CreateAssetDto, session: UserSession) {
    if (!session.branchId) {
      throw new BadRequestException({
        code: 'BRANCH_REQUIRED',
        messageAr: 'الفرع مطلوب لإنشاء الأصل',
      });
    }
    const branchId = session.branchId;

    const cost = new Prisma.Decimal(dto.purchaseCostIqd);
    const salvage = new Prisma.Decimal(dto.salvageValueIqd ?? 0);
    if (dto.usefulLifeMonths <= 0) {
      throw new BadRequestException({
        code: 'INVALID_LIFE',
        messageAr: 'العمر الإنتاجي غير صالح',
      });
    }
    const monthly = cost.minus(salvage).div(dto.usefulLifeMonths);

    const category = await this.prisma.chartOfAccount.findFirst({
      where: { id: dto.categoryAccountId, companyId: session.companyId },
    });
    if (!category) {
      throw new BadRequestException({
        code: 'CATEGORY_NOT_FOUND',
        messageAr: 'حساب فئة الأصل غير موجود',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const number = await this.sequence.next(session.companyId, 'FA', branchId);

      const funding = dto.fundingSource ?? 'cash';
      const offsetCode =
        funding === 'cash' ? dto.cashAccountCode ?? '2411' : dto.apAccountCode ?? '321';

      const je = await this.posting.postJournalEntry(
        {
          companyId: session.companyId,
          branchId,
          entryDate: new Date(dto.acquisitionDate),
          refType: 'FixedAssetAcquisition',
          refId: number,
          description: `Acquisition of ${dto.nameAr} (${number})`,
          lines: [
            { accountCode: category.code, debit: cost.toNumber(), description: dto.nameAr },
            { accountCode: offsetCode, credit: cost.toNumber(), description: dto.nameAr },
          ],
        },
        { userId: session.userId },
        tx,
      );

      const asset = await tx.fixedAsset.create({
        data: {
          companyId: session.companyId,
          branchId,
          number,
          nameAr: dto.nameAr,
          categoryAccountId: dto.categoryAccountId,
          accumDepAccountId: dto.accumDepAccountId,
          depreciationExpenseAccountId: dto.depreciationExpenseAccountId,
          costCenterId: dto.costCenterId,
          acquisitionDate: new Date(dto.acquisitionDate),
          purchaseCostIqd: cost,
          salvageValueIqd: salvage,
          usefulLifeMonths: dto.usefulLifeMonths,
          depreciationMethod: (dto.depreciationMethod ?? 'straight_line') as any,
          monthlyDepIqd: monthly,
          accumulatedDepIqd: new Prisma.Decimal(0),
          bookValueIqd: cost,
          serialNumber: dto.serialNumber,
          vendorId: dto.vendorId,
          warrantyUntil: dto.warrantyUntil ? new Date(dto.warrantyUntil) : null,
          location: dto.location,
          assignedTo: dto.assignedTo,
          status: 'active' as any,
          createdBy: session.userId,
        },
      });

      return { asset, je };
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'FixedAsset',
      entityId: result.asset.id,
      action: 'create',
      after: result.asset,
    });

    return result.asset;
  }

  async update(id: string, dto: Partial<CreateAssetDto>, session: UserSession) {
    const existing = await this.findOne(id, session.companyId);
    const data: Prisma.FixedAssetUpdateInput = {};
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr;
    if (dto.serialNumber !== undefined) data.serialNumber = dto.serialNumber;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.assignedTo !== undefined) data.assignedTo = dto.assignedTo;
    if (dto.warrantyUntil !== undefined)
      data.warrantyUntil = new Date(dto.warrantyUntil);
    if (dto.costCenterId !== undefined) data.costCenterId = dto.costCenterId;

    const updated = await this.prisma.fixedAsset.update({ where: { id }, data });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'FixedAsset',
      entityId: id,
      action: 'update',
      before: existing,
      after: updated,
    });
    return updated;
  }

  async findAll(
    companyId: string,
    filters: { status?: string; branchId?: string } = {},
  ) {
    return this.prisma.fixedAsset.findMany({
      where: {
        companyId,
        ...(filters.status ? { status: filters.status as any } : {}),
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
      },
      orderBy: { number: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const a = await this.prisma.fixedAsset.findFirst({
      where: { id, companyId },
      include: {
        depreciationEntries: {
          orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
        },
        maintenanceRecords: { orderBy: { date: 'desc' } },
      },
    });
    if (!a) {
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        messageAr: 'الأصل غير موجود',
      });
    }
    return a;
  }

  /**
   * Records maintenance. If isCapital: capitalizes cost, recomputes monthly depreciation.
   */
  async recordMaintenance(dto: RecordMaintenanceDto, session: UserSession) {
    if (!session.branchId) {
      throw new BadRequestException({
        code: 'BRANCH_REQUIRED',
        messageAr: 'الفرع مطلوب',
      });
    }
    const branchId = session.branchId;

    const cost = new Prisma.Decimal(dto.costIqd);
    const asset = await this.findOne(dto.assetId, session.companyId);

    return this.prisma.$transaction(async (tx) => {
      const maintenance = await tx.assetMaintenance.create({
        data: {
          assetId: dto.assetId,
          date: new Date(dto.date),
          type: dto.type,
          description: dto.description,
          costIqd: cost,
          isCapital: dto.isCapital,
          createdBy: session.userId,
        },
      });

      if (dto.isCapital) {
        const newCost = asset.purchaseCostIqd.plus(cost);
        const monthsUsed = Math.max(
          1,
          Math.round(
            (Date.now() - asset.acquisitionDate.getTime()) /
              (1000 * 60 * 60 * 24 * 30),
          ),
        );
        const remaining = Math.max(1, asset.usefulLifeMonths - monthsUsed);
        const remainingDepreciable = newCost
          .minus(asset.salvageValueIqd)
          .minus(asset.accumulatedDepIqd);
        const newMonthly = remainingDepreciable.div(remaining);

        await tx.fixedAsset.update({
          where: { id: dto.assetId },
          data: {
            purchaseCostIqd: newCost,
            monthlyDepIqd: newMonthly,
            bookValueIqd: newCost.minus(asset.accumulatedDepIqd),
          },
        });

        const categoryCoa = await tx.chartOfAccount.findUnique({
          where: { id: asset.categoryAccountId },
        });
        if (!categoryCoa) {
          throw new BadRequestException({
            code: 'CATEGORY_COA_NOT_FOUND',
            messageAr: 'حساب فئة الأصل غير موجود',
          });
        }
        await this.posting.postJournalEntry(
          {
            companyId: session.companyId,
            branchId,
            entryDate: new Date(dto.date),
            refType: 'AssetMaintenanceCapital',
            refId: maintenance.id,
            description: `Capital maintenance on ${asset.number}: ${dto.description}`,
            lines: [
              { accountCode: categoryCoa.code, debit: cost.toNumber() },
              { accountCode: dto.cashAccountCode ?? '2411', credit: cost.toNumber() },
            ],
          },
          { userId: session.userId },
          tx,
        );
      } else {
        await this.posting.postJournalEntry(
          {
            companyId: session.companyId,
            branchId,
            entryDate: new Date(dto.date),
            refType: 'AssetMaintenance',
            refId: maintenance.id,
            description: `Maintenance on ${asset.number}: ${dto.description}`,
            lines: [
              { accountCode: dto.maintenanceExpenseAccountCode ?? '636', debit: cost.toNumber() },
              { accountCode: dto.cashAccountCode ?? '2411', credit: cost.toNumber() },
            ],
          },
          { userId: session.userId },
          tx,
        );
      }

      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        entity: 'FixedAsset',
        entityId: dto.assetId,
        action: 'maintenance',
        after: maintenance,
      });

      return maintenance;
    });
  }

  /**
   * Disposes an asset. Computes gain/loss. Posts disposal JE.
   */
  async dispose(dto: DisposeAssetDto, session: UserSession) {
    if (!session.branchId) {
      throw new BadRequestException({
        code: 'BRANCH_REQUIRED',
        messageAr: 'الفرع مطلوب',
      });
    }
    const branchId = session.branchId;

    const asset = await this.findOne(dto.assetId, session.companyId);
    if (asset.status === 'disposed') {
      throw new BadRequestException({
        code: 'ALREADY_DISPOSED',
        messageAr: 'تم التصرف بالأصل مسبقاً',
      });
    }

    const sale = new Prisma.Decimal(dto.saleValueIqd ?? 0);
    const bookValue = asset.bookValueIqd;
    const gainLoss = sale.minus(bookValue);

    return this.prisma.$transaction(async (tx) => {
      const categoryCoa = await tx.chartOfAccount.findUnique({
        where: { id: asset.categoryAccountId },
      });
      const accumCoa = await tx.chartOfAccount.findUnique({
        where: { id: asset.accumDepAccountId },
      });
      if (!categoryCoa || !accumCoa) {
        throw new BadRequestException({
          code: 'ASSET_COA_MISSING',
          messageAr: 'حسابات الأصل غير مكتملة',
        });
      }

      const lines: Array<{
        accountCode: string;
        debit?: number;
        credit?: number;
        description?: string;
      }> = [];

      lines.push({ accountCode: accumCoa.code, debit: asset.accumulatedDepIqd.toNumber() });
      if (dto.method === 'sold' && sale.gt(0)) {
        lines.push({ accountCode: dto.cashAccountCode ?? '2411', debit: sale.toNumber() });
      }
      lines.push({ accountCode: categoryCoa.code, credit: asset.purchaseCostIqd.toNumber() });
      if (gainLoss.gt(0)) {
        lines.push({
          accountCode: dto.gainAccountCode ?? '593',
          credit: gainLoss.toNumber(),
        });
      } else if (gainLoss.lt(0)) {
        lines.push({
          accountCode: dto.lossAccountCode ?? '69',
          debit: gainLoss.abs().toNumber(),
        });
      }

      await this.posting.postJournalEntry(
        {
          companyId: session.companyId,
          branchId,
          entryDate: new Date(),
          refType: 'FixedAssetDisposal',
          refId: asset.id,
          description: `Disposal of asset ${asset.number} (${dto.method})`,
          lines,
        },
        { userId: session.userId },
        tx,
      );

      const updated = await tx.fixedAsset.update({
        where: { id: asset.id },
        data: {
          status: 'disposed' as any,
          disposedAt: new Date(),
          disposalMethod: dto.method,
          disposalValueIqd: sale,
          disposalGainLossIqd: gainLoss,
          bookValueIqd: new Prisma.Decimal(0),
        },
      });

      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        entity: 'FixedAsset',
        entityId: asset.id,
        action: 'dispose',
        after: updated,
      });

      return updated;
    });
  }

  /**
   * Transfer asset between branches. Simplified: logs change.
   */
  async transfer(
    assetId: string,
    toBranchId: string,
    session: UserSession,
  ) {
    const asset = await this.findOne(assetId, session.companyId);
    const updated = await this.prisma.fixedAsset.update({
      where: { id: assetId },
      data: { branchId: toBranchId },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'FixedAsset',
      entityId: assetId,
      action: 'transfer',
      before: { branchId: asset.branchId },
      after: { branchId: toBranchId },
    });
    return updated;
  }
}
