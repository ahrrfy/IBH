import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import type { ImportableEntityType } from '../dto/data-migration.dto';
import type { ValidationError } from './format.validator';

export interface ReferentialResult {
  errors: ValidationError[];
  resolvedIds: Record<string, string>;
}

interface RefCheck {
  sourceField: string;
  table: string;
  codeField: string;
  targetIdField: string;
  labelAr: string;
  labelEn: string;
  /** If true, the referenced row must NOT have isActive = false / deletedAt set */
  enforceActive?: boolean;
  /** Some tables use `isActive` for soft-delete instead of `deletedAt` */
  softDeleteField?: 'deletedAt' | 'isActive';
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

      const id = await this.resolve(check, String(code).trim(), companyId);
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

  private async resolve(check: RefCheck, codeValue: string, companyId: string): Promise<string | null> {
    const db = this.prisma as any;
    if (!db[check.table]) return null;

    const where: any = { [check.codeField]: codeValue, companyId };
    if (check.softDeleteField === 'deletedAt') where.deletedAt = null;
    if (check.softDeleteField === 'isActive') where.isActive = true;

    const record = await db[check.table].findFirst({ where, select: { id: true } });
    return record?.id ?? null;
  }

  private getChecks(entityType: ImportableEntityType): RefCheck[] {
    switch (entityType) {
      case 'product_template':
        return [
          { sourceField: 'categoryNameAr', table: 'productCategory', codeField: 'nameAr', targetIdField: 'categoryId', labelAr: 'الفئة', labelEn: 'Category', softDeleteField: 'isActive' },
          { sourceField: 'uomAbbreviation', table: 'unitOfMeasure', codeField: 'abbreviation', targetIdField: 'uomId', labelAr: 'وحدة القياس', labelEn: 'UoM', softDeleteField: 'isActive' },
        ];
      case 'product_variant':
        return [
          { sourceField: 'templateSku', table: 'productTemplate', codeField: 'sku', targetIdField: 'templateId', labelAr: 'المنتج', labelEn: 'Product', softDeleteField: 'deletedAt' },
        ];
      case 'product_category':
        return [
          { sourceField: 'parentNameAr', table: 'productCategory', codeField: 'nameAr', targetIdField: 'parentId', labelAr: 'الفئة الأب', labelEn: 'Parent Category', softDeleteField: 'isActive' },
        ];
      case 'chart_of_accounts':
        return [
          { sourceField: 'parentCode', table: 'chartOfAccount', codeField: 'code', targetIdField: 'parentId', labelAr: 'الحساب الأب', labelEn: 'Parent Account', softDeleteField: 'isActive' },
        ];
      case 'opening_stock':
        return [
          { sourceField: 'variantSku', table: 'productVariant', codeField: 'sku', targetIdField: 'variantId', labelAr: 'المتغير', labelEn: 'Variant', softDeleteField: 'deletedAt' },
          { sourceField: 'warehouseCode', table: 'warehouse', codeField: 'code', targetIdField: 'warehouseId', labelAr: 'المستودع', labelEn: 'Warehouse', softDeleteField: 'deletedAt' },
        ];
      case 'opening_balance':
        return [
          { sourceField: 'accountCode', table: 'chartOfAccount', codeField: 'code', targetIdField: 'accountId', labelAr: 'الحساب', labelEn: 'Account', softDeleteField: 'isActive' },
        ];
      case 'price_list':
        return [
          { sourceField: 'variantSku', table: 'productVariant', codeField: 'sku', targetIdField: 'variantId', labelAr: 'المتغير', labelEn: 'Variant', softDeleteField: 'deletedAt' },
        ];
      case 'employee':
        return [
          { sourceField: 'departmentCode', table: 'department', codeField: 'code', targetIdField: 'departmentId', labelAr: 'القسم', labelEn: 'Department', softDeleteField: 'isActive' },
        ];
      case 'department':
        return [
          { sourceField: 'parentCode', table: 'department', codeField: 'code', targetIdField: 'parentId', labelAr: 'القسم الأب', labelEn: 'Parent Department', softDeleteField: 'isActive' },
        ];
      case 'reorder_point':
        return [
          { sourceField: 'variantSku', table: 'productVariant', codeField: 'sku', targetIdField: 'variantId', labelAr: 'المتغير', labelEn: 'Variant', softDeleteField: 'deletedAt' },
          { sourceField: 'warehouseCode', table: 'warehouse', codeField: 'code', targetIdField: 'warehouseId', labelAr: 'المستودع', labelEn: 'Warehouse', softDeleteField: 'deletedAt' },
        ];
      case 'supplier_price':
        return [
          { sourceField: 'supplierCode', table: 'supplier', codeField: 'code', targetIdField: 'supplierId', labelAr: 'المورد', labelEn: 'Supplier', softDeleteField: 'deletedAt' },
          { sourceField: 'variantSku', table: 'productVariant', codeField: 'sku', targetIdField: 'variantId', labelAr: 'المتغير', labelEn: 'Variant', softDeleteField: 'deletedAt' },
        ];
      default:
        return [];
    }
  }
}
