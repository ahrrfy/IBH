import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import type { ImportableEntityType } from '../dto/data-migration.dto';

export interface DuplicateResult {
  isDuplicate: boolean;
  existingId?: string;
  matchField?: string;
}

@Injectable()
export class DuplicateDetector {
  constructor(private readonly prisma: PrismaService) {}

  async check(
    data: Record<string, unknown>,
    entityType: ImportableEntityType,
    companyId: string,
  ): Promise<DuplicateResult> {
    const strategy = this.getStrategy(entityType);
    if (!strategy) return { isDuplicate: false };

    const db = this.prisma as any;
    const table = strategy.table;
    if (!db[table]) return { isDuplicate: false };

    for (const field of strategy.exactFields) {
      const val = data[field.source];
      if (!val) continue;

      const where: any = { [field.dbField]: String(val), companyId };
      if (strategy.softDelete === 'deletedAt') where.deletedAt = null;
      if (strategy.softDelete === 'isActive') where.isActive = true;

      const existing = await db[table].findFirst({ where, select: { id: true } });
      if (existing) {
        return { isDuplicate: true, existingId: existing.id, matchField: field.source };
      }
    }

    return { isDuplicate: false };
  }

  private getStrategy(entityType: ImportableEntityType): {
    table: string;
    softDelete: 'deletedAt' | 'isActive' | null;
    exactFields: Array<{ source: string; dbField: string }>;
  } | null {
    switch (entityType) {
      case 'product_template': return { table: 'productTemplate', softDelete: 'deletedAt', exactFields: [{ source: 'sku', dbField: 'sku' }] };
      case 'product_variant':  return { table: 'productVariant',  softDelete: 'deletedAt', exactFields: [{ source: 'sku', dbField: 'sku' }] };
      case 'product_category': return { table: 'productCategory', softDelete: 'isActive',  exactFields: [{ source: 'nameAr', dbField: 'nameAr' }] };
      case 'unit_of_measure':  return { table: 'unitOfMeasure',   softDelete: 'isActive',  exactFields: [{ source: 'abbreviation', dbField: 'abbreviation' }] };
      case 'customer':         return { table: 'customer',        softDelete: 'deletedAt', exactFields: [{ source: 'code', dbField: 'code' }, { source: 'phone', dbField: 'phone' }] };
      case 'supplier':         return { table: 'supplier',        softDelete: 'deletedAt', exactFields: [{ source: 'code', dbField: 'code' }] };
      case 'chart_of_accounts': return { table: 'chartOfAccount', softDelete: 'isActive',  exactFields: [{ source: 'code', dbField: 'code' }] };
      case 'employee':         return { table: 'employee',        softDelete: 'deletedAt', exactFields: [{ source: 'employeeNumber', dbField: 'employeeNumber' }, { source: 'nationalId', dbField: 'nationalId' }] };
      case 'warehouse':        return { table: 'warehouse',       softDelete: 'deletedAt', exactFields: [{ source: 'code', dbField: 'code' }] };
      case 'department':       return { table: 'department',      softDelete: 'isActive',  exactFields: [{ source: 'code', dbField: 'code' }] };
      default: return null;
    }
  }
}
