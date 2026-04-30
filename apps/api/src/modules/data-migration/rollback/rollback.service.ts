import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import type { IEntityImporter, ImportContext } from '../importers/importer.interface';

@Injectable()
export class RollbackService {
  private readonly logger = new Logger(RollbackService.name);
  private importerMap = new Map<string, IEntityImporter>();

  constructor(private readonly prisma: PrismaService) {}

  registerImporters(importers: IEntityImporter[]): void {
    for (const imp of importers) {
      this.importerMap.set(imp.entityType, imp);
    }
  }

  async rollback(sessionId: string, userId: string): Promise<{ rolledBack: number; failed: number }> {
    const session = await this.prisma.importSession.findUnique({ where: { id: sessionId } });

    if (!session) throw new BadRequestException('Session not found');
    if (!['completed', 'completed_partial'].includes(session.status)) {
      throw new BadRequestException('Only completed sessions can be rolled back');
    }
    if (session.rolledBackAt) {
      throw new BadRequestException('Session already rolled back');
    }

    const importer = this.importerMap.get(session.entityType);
    if (!importer) throw new BadRequestException(`No importer for ${session.entityType}`);

    const ctx: ImportContext = {
      companyId: session.companyId,
      branchId: session.branchId,
      userId,
      batchTag: `rollback-${sessionId.slice(-8)}`,
      sessionId,
    };

    // Reverse order
    const importedRows = await this.prisma.importRow.findMany({
      where: { sessionId, status: { in: ['imported', 'warning'] }, createdEntityId: { not: null } },
      orderBy: { rowNumber: 'desc' },
    });

    let rolledBack = 0;
    let failed = 0;

    for (const row of importedRows) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await importer.rollback(row.createdEntityId!, ctx, tx);
        });
        await this.prisma.importRow.update({
          where: { id: row.id },
          data: { status: 'rolled_back' },
        });
        rolledBack++;
      } catch (err: any) {
        this.logger.error(`Rollback failed for row ${row.rowNumber}: ${err.message}`);
        failed++;
      }
    }

    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: {
        status: 'rolled_back',
        rolledBackAt: new Date(),
        rolledBackBy: userId,
      },
    });

    return { rolledBack, failed };
  }
}
