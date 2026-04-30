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

      const existing = await db[table].findFirst({
        where: { [field.dbField]: String(val), companyId, deletedAt: null },
        select: { id: true },
      });

      if (existing) {
        return { isDuplicate: true, existingId: existing.id, matchField: field.source };
      }
    }

    return { isDuplicate: false };
  }

  private getStrategy(entityType: ImportableEntityType): {
    table: string;
    exactFields: Array<{ source: string; dbField: string }>;
  } | null {
    switch (entityType) {
      case 'product_template': return { table: 'productTemplate', exactFields: [{ source: 'sku', dbField: 'sku' }] };
      case 'product_variant': return { table: 'productVariant', exactFields: [{ source: 'sku', dbField: 'sku' }] };
      case 'product_category': return { table: 'productCategory', exactFields: [{ source: 'code', dbField: 'code' }] };
      case 'unit_of_measure': return { table: 'unitOfMeasure', exactFields: [{ source: 'code', dbField: 'code' }] };
      case 'customer': return { table: 'customer', exactFields: [{ source: 'phone', dbField: 'phone' }, { source: 'code', dbField: 'code' }] };
      case 'supplier': return { table: 'supplier', exactFields: [{ source: 'code', dbField: 'code' }] };
      case 'chart_of_accounts': return { table: 'chartOfAccount', exactFields: [{ source: 'code', dbField: 'code' }] };
      case 'employee': return { table: 'employee', exactFields: [{ source: 'nationalId', dbField: 'nationalId' }, { source: 'code', dbField: 'code' }] };
      case 'warehouse': return { table: 'warehouse', exactFields: [{ source: 'code', dbField: 'code' }] };
      case 'department': return { table: 'department', exactFields: [{ source: 'code', dbField: 'code' }] };
      default: return null;
    }
  }
}
