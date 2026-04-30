import type { Prisma } from '@prisma/client';
import type { ImportableEntityType } from '../dto/data-migration.dto';

export interface TemplateColumn {
  field: string;
  labelAr: string;
  labelEn: string;
  required: boolean;
  type: string;
  example: string;
}

export interface ImportContext {
  companyId: string;
  branchId: string | null;
  userId: string;
  batchTag: string;
  sessionId: string;
}

export interface IEntityImporter {
  readonly entityType: ImportableEntityType;
  readonly dependsOn: ImportableEntityType[];
  create(
    data: Record<string, unknown>,
    resolvedIds: Record<string, string>,
    ctx: ImportContext,
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string }>;
  rollback(entityId: string, ctx: ImportContext, tx: Prisma.TransactionClient): Promise<void>;
  getTemplateColumns(): TemplateColumn[];
}
