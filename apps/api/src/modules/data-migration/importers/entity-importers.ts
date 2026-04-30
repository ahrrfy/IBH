import { Injectable, BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { IEntityImporter, ImportContext, TemplateColumn } from './importer.interface';
import type { ImportableEntityType } from '../dto/data-migration.dto';
import { ENTITY_FIELD_REGISTRY } from '../mappers/entity-field-registry';
import { InventoryService } from '../../inventory/inventory.service';
import { PostingService } from '../../../engines/posting/posting.service';
import { PolicyService } from '../../../engines/policy/policy.service';
import type { DocumentType } from '@erp/shared-types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function s(v: unknown): string { return String(v ?? '').trim(); }
function sOrNull(v: unknown): string | null {
  const x = s(v);
  return x === '' ? null : x;
}
function n(v: unknown): number {
  const num = Number(s(v).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}
function nOrNull(v: unknown): number | null {
  if (v === null || v === undefined || s(v) === '') return null;
  const num = Number(s(v).replace(/,/g, ''));
  return isNaN(num) ? null : num;
}
function b(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  return ['true', '1', 'yes', 'نعم', 'صح'].includes(s(v).toLowerCase());
}

// ─── Base (soft-delete rollback) ─────────────────────────────────────────────

abstract class BaseImporter implements IEntityImporter {
  abstract readonly entityType: ImportableEntityType;
  abstract readonly dependsOn: ImportableEntityType[];
  abstract readonly tableName: string;
  /** 'deletedAt' or 'isActive' — how this table tracks soft-delete */
  abstract readonly softDeleteField: 'deletedAt' | 'isActive';

  abstract create(
    data: Record<string, unknown>,
    resolvedIds: Record<string, string>,
    ctx: ImportContext,
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string }>;

  async rollback(entityId: string, ctx: ImportContext, tx: Prisma.TransactionClient): Promise<void> {
    const db = tx as any;
    if (!db[this.tableName]) return;

    const updateData: any =
      this.softDeleteField === 'deletedAt'
        ? { deletedAt: new Date(), deletedBy: ctx.userId }
        : { isActive: false };

    await db[this.tableName].update({ where: { id: entityId }, data: updateData });
  }

  getTemplateColumns(): TemplateColumn[] {
    return ENTITY_FIELD_REGISTRY[this.entityType].map((f) => ({
      field: f.field,
      labelAr: f.labelAr,
      labelEn: f.labelEn,
      required: f.required,
      type: f.type,
      example: f.example,
    }));
  }
}

// ─── 1. Product Category (uses isActive for soft-delete) ─────────────────────

@Injectable()
export class ProductCategoryImporter extends BaseImporter {
  readonly entityType = 'product_category' as const;
  readonly dependsOn: ImportableEntityType[] = [];
  readonly tableName = 'productCategory';
  readonly softDeleteField = 'isActive' as const;

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.productCategory.create({
      data: {
        nameAr: s(data['nameAr']),
        nameEn: sOrNull(data['nameEn']),
        parentId: resolvedIds['parentId'] ?? null,
        sortOrder: data['sortOrder'] !== undefined ? n(data['sortOrder']) : 0,
        companyId: ctx.companyId,
      },
    });
    return { id: record.id };
  }
}

// ─── 2. Unit of Measure (no `code`/`category`; uses abbreviation) ────────────

@Injectable()
export class UomImporter extends BaseImporter {
  readonly entityType = 'unit_of_measure' as const;
  readonly dependsOn: ImportableEntityType[] = [];
  readonly tableName = 'unitOfMeasure';
  readonly softDeleteField = 'isActive' as const;

  async create(data: Record<string, unknown>, _r: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.unitOfMeasure.create({
      data: {
        abbreviation: s(data['abbreviation']),
        nameAr: s(data['nameAr']),
        nameEn: sOrNull(data['nameEn']),
        isBaseUnit: b(data['isBaseUnit']),
        companyId: ctx.companyId,
      },
    });
    return { id: record.id };
  }
}

// ─── 3. Product Template (defaultSale/PurchasePriceIqd; 3 unit FKs; required createdBy) ──

@Injectable()
export class ProductTemplateImporter extends BaseImporter {
  readonly entityType = 'product_template' as const;
  readonly dependsOn: ImportableEntityType[] = ['product_category', 'unit_of_measure'];
  readonly tableName = 'productTemplate';
  readonly softDeleteField = 'deletedAt' as const;

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const uomId = resolvedIds['uomId'];
    const nameAr = s(data['nameAr']);
    const record = await db.productTemplate.create({
      data: {
        sku: s(data['sku']),
        nameAr,
        nameEn: sOrNull(data['nameEn']),
        name1: nameAr,
        generatedFullName: nameAr,
        categoryId: resolvedIds['categoryId'],
        baseUnitId: uomId,
        saleUnitId: uomId,
        purchaseUnitId: uomId,
        type: (s(data['type']) || 'storable') as any,
        defaultSalePriceIqd: n(data['defaultSalePriceIqd']),
        defaultPurchasePriceIqd: n(data['defaultPurchasePriceIqd']),
        minSalePriceIqd: n(data['minSalePriceIqd']),
        description: sOrNull(data['description']),
        companyId: ctx.companyId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    return { id: record.id };
  }
}

// ─── 4. Product Variant (no salePrice/costPrice on table; barcode separate) ──

@Injectable()
export class ProductVariantImporter extends BaseImporter {
  readonly entityType = 'product_variant' as const;
  readonly dependsOn: ImportableEntityType[] = ['product_template'];
  readonly tableName = 'productVariant';
  readonly softDeleteField = 'deletedAt' as const;

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const attributesRaw = s(data['attributes']);
    const attributeValues = this.parseAttributes(attributesRaw);

    const record = await db.productVariant.create({
      data: {
        sku: s(data['sku']),
        templateId: resolvedIds['templateId'],
        attributeValues,
        weight: data['weight'] !== undefined && s(data['weight']) !== '' ? n(data['weight']) : null,
        volume: data['volume'] !== undefined && s(data['volume']) !== '' ? n(data['volume']) : null,
        companyId: ctx.companyId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    if (data['barcode']) {
      await db.variantBarcode.create({
        data: {
          variantId: record.id,
          barcode: s(data['barcode']),
          barcodeType: 'EAN13',
          isPrimary: true,
          companyId: ctx.companyId,
        },
      });
    }

    return { id: record.id };
  }

  /** Parse "اللون=أسود;الحجم=L" → { "اللون": "أسود", "الحجم": "L" } */
  private parseAttributes(raw: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (!raw) return result;
    for (const pair of raw.split(/[;،,]/)) {
      const [k, v] = pair.split('=').map((x) => x.trim());
      if (k && v) result[k] = v;
    }
    return result;
  }
}

// ─── 5. Warehouse (branchId required) ────────────────────────────────────────

@Injectable()
export class WarehouseImporter extends BaseImporter {
  readonly entityType = 'warehouse' as const;
  readonly dependsOn: ImportableEntityType[] = [];
  readonly tableName = 'warehouse';
  readonly softDeleteField = 'deletedAt' as const;

  async create(data: Record<string, unknown>, _r: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    if (!ctx.branchId) {
      throw new BadRequestException({
        messageAr: 'يجب اختيار فرع لاستيراد المستودعات',
        messageEn: 'Branch is required to import warehouses',
      });
    }
    const record = await db.warehouse.create({
      data: {
        code: s(data['code']),
        nameAr: s(data['nameAr']),
        nameEn: sOrNull(data['nameEn']),
        type: (s(data['type']) || 'main') as any,
        address: sOrNull(data['address']),
        isDefault: b(data['isDefault']),
        branchId: ctx.branchId,
        companyId: ctx.companyId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    return { id: record.id };
  }
}

// ─── 6. Customer ─────────────────────────────────────────────────────────────

@Injectable()
export class CustomerImporter extends BaseImporter {
  readonly entityType = 'customer' as const;
  readonly dependsOn: ImportableEntityType[] = [];
  readonly tableName = 'customer';
  readonly softDeleteField = 'deletedAt' as const;

  async create(data: Record<string, unknown>, _r: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.customer.create({
      data: {
        code: s(data['code']),
        type: (s(data['type']) || 'regular') as any,
        nameAr: s(data['nameAr']),
        nameEn: sOrNull(data['nameEn']),
        phone: sOrNull(data['phone']),
        whatsapp: sOrNull(data['whatsapp']),
        email: sOrNull(data['email']),
        address: sOrNull(data['address']),
        city: sOrNull(data['city']),
        creditLimitIqd: n(data['creditLimitIqd']),
        taxNumber: sOrNull(data['taxNumber']),
        companyId: ctx.companyId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    return { id: record.id };
  }
}

// ─── 7. Supplier ─────────────────────────────────────────────────────────────

@Injectable()
export class SupplierImporter extends BaseImporter {
  readonly entityType = 'supplier' as const;
  readonly dependsOn: ImportableEntityType[] = [];
  readonly tableName = 'supplier';
  readonly softDeleteField = 'deletedAt' as const;

  async create(data: Record<string, unknown>, _r: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.supplier.create({
      data: {
        code: s(data['code']),
        type: (s(data['type']) || 'local') as any,
        nameAr: s(data['nameAr']),
        nameEn: sOrNull(data['nameEn']),
        phone: sOrNull(data['phone']),
        email: sOrNull(data['email']),
        address: sOrNull(data['address']),
        paymentTermsDays: data['paymentTermsDays'] !== undefined ? n(data['paymentTermsDays']) : 0,
        creditLimitIqd: n(data['creditLimitIqd']),
        taxNumber: sOrNull(data['taxNumber']),
        companyId: ctx.companyId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    return { id: record.id };
  }
}

// ─── 8. Chart of Accounts (category + accountType enums; allowDirectPosting) ─

@Injectable()
export class ChartOfAccountsImporter extends BaseImporter {
  readonly entityType = 'chart_of_accounts' as const;
  readonly dependsOn: ImportableEntityType[] = [];
  readonly tableName = 'chartOfAccount';
  readonly softDeleteField = 'isActive' as const;

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.chartOfAccount.create({
      data: {
        code: s(data['code']),
        nameAr: s(data['nameAr']),
        nameEn: sOrNull(data['nameEn']),
        category: s(data['category']) as any,
        accountType: s(data['accountType']) as any,
        parentId: resolvedIds['parentId'] ?? null,
        isHeader: b(data['isHeader']),
        allowDirectPosting:
          data['allowDirectPosting'] !== undefined ? b(data['allowDirectPosting']) : true,
        currency: s(data['currency']) || 'IQD',
        companyId: ctx.companyId,
        createdBy: ctx.userId,
      },
    });
    return { id: record.id };
  }
}

// ─── 9. Department ───────────────────────────────────────────────────────────

@Injectable()
export class DepartmentImporter extends BaseImporter {
  readonly entityType = 'department' as const;
  readonly dependsOn: ImportableEntityType[] = [];
  readonly tableName = 'department';
  readonly softDeleteField = 'isActive' as const;

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.department.create({
      data: {
        code: s(data['code']),
        nameAr: s(data['nameAr']),
        nameEn: sOrNull(data['nameEn']),
        parentId: resolvedIds['parentId'] ?? null,
        companyId: ctx.companyId,
      },
    });
    return { id: record.id };
  }
}

// ─── 10. Employee (employeeNumber unique; branchId+hireDate+baseSalaryIqd required) ─

@Injectable()
export class EmployeeImporter extends BaseImporter {
  readonly entityType = 'employee' as const;
  readonly dependsOn: ImportableEntityType[] = ['department'];
  readonly tableName = 'employee';
  readonly softDeleteField = 'deletedAt' as const;

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    if (!ctx.branchId) {
      throw new BadRequestException({
        messageAr: 'يجب اختيار فرع لاستيراد الموظفين',
        messageEn: 'Branch is required to import employees',
      });
    }
    const record = await db.employee.create({
      data: {
        employeeNumber: s(data['employeeNumber']),
        nameAr: s(data['nameAr']),
        nameEn: sOrNull(data['nameEn']),
        nationalId: sOrNull(data['nationalId']),
        phone: sOrNull(data['phone']),
        email: sOrNull(data['email']),
        departmentId: resolvedIds['departmentId'] ?? null,
        positionTitle: sOrNull(data['positionTitle']),
        hireDate: data['hireDate'] instanceof Date ? data['hireDate'] : new Date(),
        baseSalaryIqd: n(data['baseSalaryIqd']),
        branchId: ctx.branchId,
        companyId: ctx.companyId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    return { id: record.id };
  }
}

// ─── 11. Price List Item (priceIqd; effectiveFrom required; createdBy required) ─

@Injectable()
export class PriceListImporter extends BaseImporter {
  readonly entityType = 'price_list' as const;
  readonly dependsOn: ImportableEntityType[] = ['product_variant'];
  readonly tableName = 'priceListItem';
  readonly softDeleteField = 'isActive' as const;

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const listNameAr = s(data['listNameAr']);

    let priceList = await db.priceList.findFirst({
      where: { nameAr: listNameAr, companyId: ctx.companyId, isActive: true },
    });
    if (!priceList) {
      priceList = await db.priceList.create({
        data: {
          nameAr: listNameAr,
          type: s(data['listType']) || 'retail',
          currency: 'IQD',
          companyId: ctx.companyId,
          createdBy: ctx.userId,
        },
      });
    }

    const effectiveFrom =
      data['effectiveFrom'] instanceof Date ? data['effectiveFrom'] : new Date();
    const effectiveTo = data['effectiveTo'] instanceof Date ? data['effectiveTo'] : null;

    const record = await db.priceListItem.create({
      data: {
        priceListId: priceList.id,
        variantId: resolvedIds['variantId'],
        priceIqd: n(data['priceIqd']),
        effectiveFrom,
        effectiveTo,
        createdBy: ctx.userId,
      },
    });
    return { id: record.id };
  }

  // Override: priceListItem has no soft-delete. Hard delete instead.
  async rollback(entityId: string, _ctx: ImportContext, tx: Prisma.TransactionClient): Promise<void> {
    const db = tx as any;
    await db.priceListItem.deleteMany({ where: { id: entityId } });
  }
}

// ─── 12. Reorder Point (no soft-delete; reorderQty + reorderAmount + safetyStock + leadTimeDays) ─

@Injectable()
export class ReorderPointImporter extends BaseImporter {
  readonly entityType = 'reorder_point' as const;
  readonly dependsOn: ImportableEntityType[] = ['product_variant', 'warehouse'];
  readonly tableName = 'reorderPoint';
  readonly softDeleteField = 'isActive' as const;

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.reorderPoint.create({
      data: {
        variantId: resolvedIds['variantId'],
        warehouseId: resolvedIds['warehouseId'],
        reorderQty: n(data['reorderQty']),
        reorderAmount: n(data['reorderAmount']),
        safetyStock: n(data['safetyStock']),
        leadTimeDays:
          data['leadTimeDays'] !== undefined && s(data['leadTimeDays']) !== ''
            ? n(data['leadTimeDays'])
            : 7,
        companyId: ctx.companyId,
      },
    });
    return { id: record.id };
  }

  // Override: reorderPoint has no soft-delete. Hard delete instead.
  async rollback(entityId: string, _ctx: ImportContext, tx: Prisma.TransactionClient): Promise<void> {
    const db = tx as any;
    await db.reorderPoint.deleteMany({ where: { id: entityId } });
  }
}

// ─── 13. Supplier Price ──────────────────────────────────────────────────────

@Injectable()
export class SupplierPriceImporter extends BaseImporter {
  readonly entityType = 'supplier_price' as const;
  readonly dependsOn: ImportableEntityType[] = ['supplier', 'product_variant'];
  readonly tableName = 'supplierPrice';
  readonly softDeleteField = 'isActive' as const;

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.supplierPrice.create({
      data: {
        supplierId: resolvedIds['supplierId'],
        variantId: resolvedIds['variantId'],
        priceIqd: n(data['priceIqd']),
        currency: s(data['currency']) || 'IQD',
        leadTimeDays:
          data['leadTimeDays'] !== undefined && s(data['leadTimeDays']) !== ''
            ? n(data['leadTimeDays'])
            : 7,
        minQty:
          data['minQty'] !== undefined && s(data['minQty']) !== '' ? n(data['minQty']) : 1,
        isPreferred: b(data['isPreferred']),
        createdBy: ctx.userId,
      },
    });
    return { id: record.id };
  }

  async rollback(entityId: string, _ctx: ImportContext, tx: Prisma.TransactionClient): Promise<void> {
    const db = tx as any;
    await db.supplierPrice.deleteMany({ where: { id: entityId } });
  }
}

// ─── 14. Opening Stock — F3: MUST go through InventoryService.move() ─────────
// Moving Weighted Average via real StockLedger. Append-only. Never raw Prisma.

@Injectable()
export class OpeningStockImporter implements IEntityImporter {
  readonly entityType = 'opening_stock' as const;
  readonly dependsOn: ImportableEntityType[] = ['product_variant', 'warehouse'];

  constructor(private readonly inventoryService: InventoryService) {}

  async create(
    data: Record<string, unknown>,
    resolvedIds: Record<string, string>,
    ctx: ImportContext,
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    const result = await this.inventoryService.move(
      {
        variantId: resolvedIds['variantId'],
        warehouseId: resolvedIds['warehouseId'],
        direction: 'in',
        qty: n(data['qty']),
        unitCostIqd: n(data['unitCostIqd']),
        // F3: 'opening_balance' is the canonical reference type for opening stock
        referenceType: 'opening_balance' as DocumentType,
        referenceId: ctx.sessionId,
        description: `رصيد افتتاحي — استيراد ${ctx.batchTag}`,
        performedBy: ctx.userId,
        companyId: ctx.companyId,
      },
      tx,
    );
    return { id: result.ledgerEntryId };
  }

  async rollback(entityId: string, ctx: ImportContext, tx: Prisma.TransactionClient): Promise<void> {
    // F3: Reverse with 'out' movement (append-only — never delete StockLedger)
    const db = tx as any;
    const ledger = await db.stockLedgerEntry.findUnique({
      where: { id: entityId },
      select: { variantId: true, warehouseId: true, qtyChange: true },
    });
    if (!ledger) return;

    await this.inventoryService.move(
      {
        variantId: ledger.variantId,
        warehouseId: ledger.warehouseId,
        direction: 'out',
        qty: Math.abs(Number(ledger.qtyChange)),
        referenceType: 'manual_adj' as DocumentType,
        referenceId: ctx.sessionId,
        description: `تراجع استيراد — ${ctx.batchTag}`,
        performedBy: ctx.userId,
        companyId: ctx.companyId,
      },
      tx,
    );
  }

  getTemplateColumns(): TemplateColumn[] {
    return ENTITY_FIELD_REGISTRY['opening_stock'].map((f) => ({
      field: f.field, labelAr: f.labelAr, labelEn: f.labelEn,
      required: f.required, type: f.type, example: f.example,
    }));
  }
}

// ─── 15. Opening Balance — F2: MUST go through PostingService ────────────────
// Double-entry accounting. Append-only. Reverse via reverseEntry(). Never raw Prisma.
// OBE counter-account is read from PolicyService (no hardcoded code).

@Injectable()
export class OpeningBalanceImporter implements IEntityImporter {
  readonly entityType = 'opening_balance' as const;
  readonly dependsOn: ImportableEntityType[] = ['chart_of_accounts'];

  constructor(
    private readonly postingService: PostingService,
    private readonly policyService: PolicyService,
  ) {}

  async create(
    data: Record<string, unknown>,
    _resolvedIds: Record<string, string>,
    ctx: ImportContext,
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    const debit = n(data['debit']);
    const credit = n(data['credit']);
    const accountCode = s(data['accountCode']);

    // OBE account code: read from policy, fallback to '3999'
    const obeCode = (await this.policyService.get<string>(
      ctx.companyId,
      'opening_balance_equity_account_code' as any,
    )) ?? '3999';

    // F2: balanced double-entry — counter to OBE account
    const result = await this.postingService.postJournalEntry(
      {
        companyId: ctx.companyId,
        branchId: ctx.branchId ?? undefined,
        entryDate: new Date(),
        refType: 'opening_balance',
        refId: ctx.sessionId,
        description: sOrNull(data['description']) ?? `رصيد افتتاحي — ${accountCode}`,
        lines: [
          {
            accountCode,
            debit: debit > 0 ? debit : undefined,
            credit: credit > 0 ? credit : undefined,
            description: 'رصيد افتتاحي',
          },
          {
            accountCode: obeCode,
            debit: credit > 0 ? credit : undefined,
            credit: debit > 0 ? debit : undefined,
            description: `مقابل رصيد افتتاحي — ${accountCode}`,
          },
        ],
      },
      { userId: ctx.userId },
      tx,
    );
    return { id: result.id };
  }

  async rollback(entityId: string, ctx: ImportContext, tx: Prisma.TransactionClient): Promise<void> {
    // F2: append-only — reverse never delete
    await this.postingService.reverseEntry(
      {
        originalEntryId: entityId,
        reason: `تراجع استيراد — ${ctx.batchTag}`,
        reversedBy: ctx.userId,
      },
      tx,
    );
  }

  getTemplateColumns(): TemplateColumn[] {
    return ENTITY_FIELD_REGISTRY['opening_balance'].map((f) => ({
      field: f.field, labelAr: f.labelAr, labelEn: f.labelEn,
      required: f.required, type: f.type, example: f.example,
    }));
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────

export const ALL_IMPORTERS = [
  ProductCategoryImporter,
  UomImporter,
  ProductTemplateImporter,
  ProductVariantImporter,
  WarehouseImporter,
  CustomerImporter,
  SupplierImporter,
  ChartOfAccountsImporter,
  DepartmentImporter,
  EmployeeImporter,
  PriceListImporter,
  ReorderPointImporter,
  SupplierPriceImporter,
  OpeningStockImporter,
  OpeningBalanceImporter,
];
