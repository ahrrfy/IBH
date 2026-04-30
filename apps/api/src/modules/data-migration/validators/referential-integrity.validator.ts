import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import type { ImportableEntityType } from '../dto/data-migration.dto';
import type { ValidationError } from './format.validator';

export interface ReferentialResult {
  errors: ValidationError[];
  resolvedIds: Record<string, string>;
}

@Injectable()
export class ReferentialIntegrityValidator {
  constructor(private readonly prisma: PrismaService) {}

  async validate(
    row: Record<string, unknown>,
    entityType: ImportableEntityType,
    companyId: string,
  ): Promise<ReferentialResult> {
    const errors: ValidationError[] = [];
    const resolvedIds: Record<string, string> = {};

    for (const check of this.getChecks(entityType)) {
      const code = row[check.sourceField] as string | undefined;
      if (!code || !String(code).trim()) continue;

      const id = await this.resolve(check.table, check.codeField, String(code).trim(), companyId);
      if (id) {
        resolvedIds[check.targetIdField] = id;
      } else {
        errors.push({
          field: check.sourceField,
          messageAr: `${check.labelAr} "${code}" غير موجود`,
          messageEn: `${check.labelEn} "${code}" not found`,
          stage: 'referential',
          suggestion: `استورد ${check.labelAr} أولاً`,
        });
      }
    }

    return { errors, resolvedIds };
  }

  private async resolve(
    table: string,
    codeField: string,
    codeValue: string,
    companyId: string,
  ): Promise<string | null> {
    const db = this.prisma as any;
    if (!db[table]) return null;

    const record = await db[table].findFirst({
      where: { [codeField]: codeValue, companyId, deletedAt: null },
      select: { id: true },
    });
    return record?.id ?? null;
  }

  private getChecks(entityType: ImportableEntityType): Array<{
    sourceField: string;
    table: string;
    codeField: string;
    targetIdField: string;
    labelAr: string;
    labelEn: string;
  }> {
    switch (entityType) {
      case 'product_template':
        return [
          { sourceField: 'categoryCode', table: 'productCategory', codeField: 'code', targetIdField: 'categoryId', labelAr: 'الفئة', labelEn: 'Category' },
          { sourceField: 'uomCode', table: 'unitOfMeasure', codeField: 'code', targetIdField: 'uomId', labelAr: 'وحدة القياس', labelEn: 'UoM' },
        ];
      case 'product_variant':
        return [
          { sourceField: 'templateSku', table: 'productTemplate', codeField: 'sku', targetIdField: 'templateId', labelAr: 'المنتج', labelEn: 'Product' },
        ];
      case 'product_category':
        return [
          { sourceField: 'parentCode', table: 'productCategory', codeField: 'code', targetIdField: 'parentId', labelAr: 'الفئة الأب', labelEn: 'Parent Category' },
        ];
      case 'chart_of_accounts':
        return [
          { sourceField: 'parentCode', table: 'chartOfAccount', codeField: 'code', targetIdField: 'parentId', labelAr: 'الحساب الأب', labelEn: 'Parent Account' },
        ];
      case 'opening_stock':
        return [
          { sourceField: 'variantSku', table: 'productVariant', codeField: 'sku', targetIdField: 'variantId', labelAr: 'المتغير', labelEn: 'Variant' },
          { sourceField: 'warehouseCode', table: 'warehouse', codeField: 'code', targetIdField: 'warehouseId', labelAr: 'المستودع', labelEn: 'Warehouse' },
        ];
      case 'opening_balance':
        return [
          { sourceField: 'accountCode', table: 'chartOfAccount', codeField: 'code', targetIdField: 'accountId', labelAr: 'الحساب', labelEn: 'Account' },
        ];
      case 'price_list':
        return [
          { sourceField: 'variantSku', table: 'productVariant', codeField: 'sku', targetIdField: 'variantId', labelAr: 'المتغير', labelEn: 'Variant' },
        ];
      case 'employee':
        return [
          { sourceField: 'departmentCode', table: 'department', codeField: 'code', targetIdField: 'departmentId', labelAr: 'القسم', labelEn: 'Department' },
        ];
      case 'reorder_point':
        return [
          { sourceField: 'variantSku', table: 'productVariant', codeField: 'sku', targetIdField: 'variantId', labelAr: 'المتغير', labelEn: 'Variant' },
          { sourceField: 'warehouseCode', table: 'warehouse', codeField: 'code', targetIdField: 'warehouseId', labelAr: 'المستودع', labelEn: 'Warehouse' },
        ];
      case 'supplier_price':
        return [
          { sourceField: 'supplierCode', table: 'supplier', codeField: 'code', targetIdField: 'supplierId', labelAr: 'المورد', labelEn: 'Supplier' },
          { sourceField: 'variantSku', table: 'productVariant', codeField: 'sku', targetIdField: 'variantId', labelAr: 'المتغير', labelEn: 'Variant' },
        ];
      default:
        return [];
    }
  }
}
