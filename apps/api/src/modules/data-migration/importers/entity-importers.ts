import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { IEntityImporter, ImportContext, TemplateColumn } from './importer.interface';
import type { ImportableEntityType } from '../dto/data-migration.dto';
import { ENTITY_FIELD_REGISTRY } from '../mappers/entity-field-registry';
import { InventoryService } from '../../inventory/inventory.service';
import { PostingService } from '../../../engines/posting/posting.service';
import type { DocumentType } from '@erp/shared-types';

// ─── Base (soft-delete rollback) ─────────────────────────────────────────────

abstract class BaseImporter implements IEntityImporter {
  abstract readonly entityType: ImportableEntityType;
  abstract readonly dependsOn: ImportableEntityType[];
  abstract readonly tableName: string;

  abstract create(
    data: Record<string, unknown>,
    resolvedIds: Record<string, string>,
    ctx: ImportContext,
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string }>;

  async rollback(entityId: string, _ctx: ImportContext, tx: Prisma.TransactionClient): Promise<void> {
    const db = tx as any;
    if (db[this.tableName]) {
      await db[this.tableName].update({
        where: { id: entityId },
        data: { deletedAt: new Date() },
      });
    }
  }

  getTemplateColumns(): TemplateColumn[] {
    const fields = ENTITY_FIELD_REGISTRY[this.entityType];
    return fields.map((f) => ({
      field: f.field,
      labelAr: f.labelAr,
      labelEn: f.labelEn,
      required: f.required,
      type: f.type,
      example: f.example,
    }));
  }
}

// ─── 1. Product Category ─────────────────────────────────────────────────────

@Injectable()
export class ProductCategoryImporter extends BaseImporter {
  readonly entityType = 'product_category' as const;
  readonly dependsOn: ImportableEntityType[] = [];
  readonly tableName = 'productCategory';

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.productCategory.create({
      data: {
        code: String(data['code']),
        nameAr: String(data['nameAr']),
        nameEn: data['nameEn'] ? String(data['nameEn']) : null,
        description: data['description'] ? String(data['description']) : null,
        parentId: resolvedIds['parentId'] ?? null,
        companyId: ctx.companyId,
      },
    });
    return { id: record.id };
  }
}

// ─── 2. Unit of Measure ──────────────────────────────────────────────────────

@Injectable()
export class UomImporter extends BaseImporter {
  readonly entityType = 'unit_of_measure' as const;
  readonly dependsOn: ImportableEntityType[] = [];
  readonly tableName = 'unitOfMeasure';

  async create(data: Record<string, unknown>, _r: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.unitOfMeasure.create({
      data: {
        code: String(data['code']),
        nameAr: String(data['nameAr']),
        nameEn: data['nameEn'] ? String(data['nameEn']) : null,
        category: data['category'] ? String(data['category']) : 'count',
        companyId: ctx.companyId,
      },
    });
    return { id: record.id };
  }
}

// ─── 3. Product Template ─────────────────────────────────────────────────────

@Injectable()
export class ProductTemplateImporter extends BaseImporter {
  readonly entityType = 'product_template' as const;
  readonly dependsOn: ImportableEntityType[] = ['product_category', 'unit_of_measure'];
  readonly tableName = 'productTemplate';

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.productTemplate.create({
      data: {
        sku: String(data['sku']),
        nameAr: String(data['nameAr']),
        nameEn: data['nameEn'] ? String(data['nameEn']) : null,
        categoryId: resolvedIds['categoryId'],
        uomId: resolvedIds['uomId'],
        type: data['type'] ? String(data['type']) : 'storable',
        salePriceIqd: data['salePrice'] ? Number(data['salePrice']) : null,
        costPriceIqd: data['costPrice'] ? Number(data['costPrice']) : null,
        minSalePriceIqd: data['minSalePrice'] ? Number(data['minSalePrice']) : null,
        taxRate: data['taxRate'] ? Number(data['taxRate']) : 0,
        description: data['description'] ? String(data['description']) : null,
        companyId: ctx.companyId,
      },
    });
    return { id: record.id };
  }
}

// ─── 4. Product Variant ──────────────────────────────────────────────────────

@Injectable()
export class ProductVariantImporter extends BaseImporter {
  readonly entityType = 'product_variant' as const;
  readonly dependsOn: ImportableEntityType[] = ['product_template'];
  readonly tableName = 'productVariant';

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.productVariant.create({
      data: {
        sku: String(data['sku']),
        templateId: resolvedIds['templateId'],
        nameAr: data['nameAr'] ? String(data['nameAr']) : null,
        salePriceIqd: data['salePrice'] ? Number(data['salePrice']) : null,
        costPriceIqd: data['costPrice'] ? Number(data['costPrice']) : null,
        companyId: ctx.companyId,
      },
    });

    if (data['barcode']) {
      await db.variantBarcode.create({
        data: {
          variantId: record.id,
          barcode: String(data['barcode']),
          type: 'ean13',
          companyId: ctx.companyId,
        },
      });
    }

    return { id: record.id };
  }
}

// ─── 5. Warehouse ────────────────────────────────────────────────────────────

@Injectable()
export class WarehouseImporter extends BaseImporter {
  readonly entityType = 'warehouse' as const;
  readonly dependsOn: ImportableEntityType[] = [];
  readonly tableName = 'warehouse';

  async create(data: Record<string, unknown>, _r: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.warehouse.create({
      data: {
        code: String(data['code']),
        nameAr: String(data['nameAr']),
        nameEn: data['nameEn'] ? String(data['nameEn']) : null,
        address: data['address'] ? String(data['address']) : null,
        isDefault: Boolean(data['isDefault']),
        branchId: ctx.branchId,
        companyId: ctx.companyId,
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

  async create(data: Record<string, unknown>, _r: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.customer.create({
      data: {
        code: data['code'] ? String(data['code']) : undefined,
        nameAr: String(data['nameAr']),
        nameEn: data['nameEn'] ? String(data['nameEn']) : null,
        phone: data['phone'] ? String(data['phone']) : null,
        email: data['email'] ? String(data['email']) : null,
        address: data['address'] ? String(data['address']) : null,
        creditLimitIqd: data['creditLimitIqd'] ? Number(data['creditLimitIqd']) : 0,
        taxNumber: data['taxNumber'] ? String(data['taxNumber']) : null,
        type: data['type'] ? String(data['type']) : 'retail',
        companyId: ctx.companyId,
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

  async create(data: Record<string, unknown>, _r: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.supplier.create({
      data: {
        code: String(data['code']),
        nameAr: String(data['nameAr']),
        nameEn: data['nameEn'] ? String(data['nameEn']) : null,
        phone: data['phone'] ? String(data['phone']) : null,
        email: data['email'] ? String(data['email']) : null,
        address: data['address'] ? String(data['address']) : null,
        paymentTermDays: data['paymentTermDays'] ? Number(data['paymentTermDays']) : 30,
        taxNumber: data['taxNumber'] ? String(data['taxNumber']) : null,
        companyId: ctx.companyId,
      },
    });
    return { id: record.id };
  }
}

// ─── 8. Chart of Accounts ────────────────────────────────────────────────────

@Injectable()
export class ChartOfAccountsImporter extends BaseImporter {
  readonly entityType = 'chart_of_accounts' as const;
  readonly dependsOn: ImportableEntityType[] = [];
  readonly tableName = 'chartOfAccount';

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.chartOfAccount.create({
      data: {
        code: String(data['code']),
        nameAr: String(data['nameAr']),
        nameEn: data['nameEn'] ? String(data['nameEn']) : null,
        accountType: String(data['accountType']),
        parentId: resolvedIds['parentId'] ?? null,
        isPostable: data['isPostable'] !== undefined ? Boolean(data['isPostable']) : true,
        normalBalance: data['normalBalance'] ? String(data['normalBalance']) : 'debit',
        companyId: ctx.companyId,
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

  async create(data: Record<string, unknown>, _r: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.department.create({
      data: {
        code: String(data['code']),
        nameAr: String(data['nameAr']),
        nameEn: data['nameEn'] ? String(data['nameEn']) : null,
        companyId: ctx.companyId,
      },
    });
    return { id: record.id };
  }
}

// ─── 10. Employee ────────────────────────────────────────────────────────────

@Injectable()
export class EmployeeImporter extends BaseImporter {
  readonly entityType = 'employee' as const;
  readonly dependsOn: ImportableEntityType[] = ['department'];
  readonly tableName = 'employee';

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.employee.create({
      data: {
        code: String(data['code']),
        nameAr: String(data['nameAr']),
        nameEn: data['nameEn'] ? String(data['nameEn']) : null,
        nationalId: data['nationalId'] ? String(data['nationalId']) : null,
        phone: data['phone'] ? String(data['phone']) : null,
        email: data['email'] ? String(data['email']) : null,
        departmentId: resolvedIds['departmentId'] ?? null,
        jobTitle: data['jobTitle'] ? String(data['jobTitle']) : null,
        hireDate: data['hireDate'] instanceof Date ? data['hireDate'] : null,
        baseSalaryIqd: data['baseSalaryIqd'] ? Number(data['baseSalaryIqd']) : null,
        branchId: ctx.branchId,
        companyId: ctx.companyId,
      },
    });
    return { id: record.id };
  }
}

// ─── 11. Price List ──────────────────────────────────────────────────────────

@Injectable()
export class PriceListImporter extends BaseImporter {
  readonly entityType = 'price_list' as const;
  readonly dependsOn: ImportableEntityType[] = ['product_variant'];
  readonly tableName = 'priceListItem';

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    let priceList = await db.priceList.findFirst({
      where: { nameAr: String(data['listName']), companyId: ctx.companyId, deletedAt: null },
    });
    if (!priceList) {
      priceList = await db.priceList.create({
        data: {
          nameAr: String(data['listName']),
          currency: data['currency'] ? String(data['currency']) : 'IQD',
          companyId: ctx.companyId,
        },
      });
    }
    const record = await db.priceListItem.create({
      data: {
        priceListId: priceList.id,
        variantId: resolvedIds['variantId'],
        price: Number(data['price']),
        minQty: data['minQty'] ? Number(data['minQty']) : 1,
        companyId: ctx.companyId,
      },
    });
    return { id: record.id };
  }
}

// ─── 12. Reorder Point ───────────────────────────────────────────────────────

@Injectable()
export class ReorderPointImporter extends BaseImporter {
  readonly entityType = 'reorder_point' as const;
  readonly dependsOn: ImportableEntityType[] = ['product_variant', 'warehouse'];
  readonly tableName = 'reorderPoint';

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.reorderPoint.create({
      data: {
        variantId: resolvedIds['variantId'],
        warehouseId: resolvedIds['warehouseId'],
        minQty: Number(data['minQty']),
        reorderQty: Number(data['reorderQty']),
        maxQty: data['maxQty'] ? Number(data['maxQty']) : null,
        companyId: ctx.companyId,
      },
    });
    return { id: record.id };
  }
}

// ─── 13. Supplier Price ──────────────────────────────────────────────────────

@Injectable()
export class SupplierPriceImporter extends BaseImporter {
  readonly entityType = 'supplier_price' as const;
  readonly dependsOn: ImportableEntityType[] = ['supplier', 'product_variant'];
  readonly tableName = 'supplierPrice';

  async create(data: Record<string, unknown>, resolvedIds: Record<string, string>, ctx: ImportContext, tx: Prisma.TransactionClient) {
    const db = tx as any;
    const record = await db.supplierPrice.create({
      data: {
        supplierId: resolvedIds['supplierId'],
        variantId: resolvedIds['variantId'],
        priceIqd: Number(data['priceIqd']),
        currency: data['currency'] ? String(data['currency']) : 'IQD',
        leadTimeDays: data['leadTimeDays'] ? Number(data['leadTimeDays']) : null,
        minOrderQty: data['minOrderQty'] ? Number(data['minOrderQty']) : null,
        companyId: ctx.companyId,
      },
    });
    return { id: record.id };
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
        qty: Number(data['qty']),
        unitCostIqd: Number(data['unitCostIqd']),
        referenceType: 'OpeningBalance' as DocumentType,
        referenceId: ctx.sessionId,
        description: `رصيد افتتاحي — استيراد ${ctx.batchTag}`,
        batchNumber: data['batchNumber'] ? String(data['batchNumber']) : undefined,
        expiryDate: data['expiryDate'] instanceof Date ? data['expiryDate'] : undefined,
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
        referenceType: 'ImportRollback' as DocumentType,
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

@Injectable()
export class OpeningBalanceImporter implements IEntityImporter {
  readonly entityType = 'opening_balance' as const;
  readonly dependsOn: ImportableEntityType[] = ['chart_of_accounts'];

  constructor(private readonly postingService: PostingService) {}

  async create(
    data: Record<string, unknown>,
    resolvedIds: Record<string, string>,
    ctx: ImportContext,
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    const debit = Number(data['debit']) || 0;
    const credit = Number(data['credit']) || 0;
    const accountCode = String(data['accountCode']);

    // F2: Each entry must be balanced. Counter-entry to Opening Balance Equity (3999).
    const result = await this.postingService.postJournalEntry(
      {
        companyId: ctx.companyId,
        branchId: ctx.branchId ?? undefined,
        entryDate: new Date(),
        refType: 'OpeningBalance',
        refId: ctx.sessionId,
        description: data['description']
          ? String(data['description'])
          : `رصيد افتتاحي — ${accountCode}`,
        lines: [
          {
            accountCode,
            debit: debit > 0 ? debit : undefined,
            credit: credit > 0 ? credit : undefined,
            description: 'رصيد افتتاحي',
            costCenterId: resolvedIds['costCenterId'] ?? undefined,
          },
          {
            accountCode: '3999',
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
    // F2: Use reverseEntry — never delete journal entries
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
