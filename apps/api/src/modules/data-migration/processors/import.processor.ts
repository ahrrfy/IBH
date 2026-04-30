import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { ValidationPipeline } from '../validators/validation-pipeline';
import type { IEntityImporter, ImportContext } from '../importers/importer.interface';
import type { ImportableEntityType } from '../dto/data-migration.dto';
import type { DateFormat } from '../transformers/date.transformer';

const BATCH_SIZE = 100;

export interface ImportJobData {
  sessionId: string;
  companyId: string;
  branchId: string | null;
  userId: string;
  entityType: ImportableEntityType;
  mapping: Record<string, string>;
  dateFormat: DateFormat;
  duplicateStrategy: 'skip' | 'update' | 'create_new';
}

@Processor('data-migration')
export class ImportProcessor {
  private readonly logger = new Logger(ImportProcessor.name);
  private importerMap = new Map<string, IEntityImporter>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly validationPipeline: ValidationPipeline,
    private readonly events: EventEmitter2,
  ) {}

  registerImporters(importers: IEntityImporter[]): void {
    for (const imp of importers) {
      this.importerMap.set(imp.entityType, imp);
    }
  }

  @Process('import')
  async handleImport(job: Job<ImportJobData>): Promise<void> {
    const { sessionId, companyId, branchId, userId, entityType, mapping, dateFormat } = job.data;
    const importer = this.importerMap.get(entityType);
    if (!importer) {
      await this.failSession(sessionId, `Importer not found for ${entityType}`);
      return;
    }

    const ctx: ImportContext = {
      companyId,
      branchId,
      userId,
      batchTag: `import-${sessionId.slice(-8)}`,
      sessionId,
    };

    try {
      await this.prisma.importSession.update({
        where: { id: sessionId },
        data: { status: 'importing', startedAt: new Date() },
      });

      const totalRows = await this.prisma.importRow.count({
        where: { sessionId, status: 'pending' },
      });

      let processed = 0;
      let imported = 0;
      let errors = 0;
      let skipped = 0;

      while (processed < totalRows) {
        const session = await this.prisma.importSession.findUnique({
          where: { id: sessionId },
          select: { status: true },
        });
        if (session?.status === 'paused') {
          this.logger.log(`Import ${sessionId} paused at row ${processed}`);
          return;
        }

        const batch = await this.prisma.importRow.findMany({
          where: { sessionId, status: 'pending' },
          orderBy: { rowNumber: 'asc' },
          take: BATCH_SIZE,
        });

        if (batch.length === 0) break;

        for (const row of batch) {
          try {
            const sourceData = row.sourceData as Record<string, unknown>;
            const validation = await this.validationPipeline.validateRow(
              sourceData, mapping, entityType, companyId, dateFormat,
            );

            if (validation.status === 'error') {
              await this.prisma.importRow.update({
                where: { id: row.id },
                data: {
                  status: 'error',
                  validationErrors: validation.errors as any,
                  warnings: validation.warnings as any,
                  processedAt: new Date(),
                },
              });
              errors++;
            } else {
              const result = await this.prisma.$transaction(async (tx) => {
                return importer.create(validation.transformedData, validation.resolvedIds, ctx, tx);
              });

              await this.prisma.importRow.update({
                where: { id: row.id },
                data: {
                  status: validation.status === 'warning' ? 'warning' : 'imported',
                  transformedData: validation.transformedData as any,
                  warnings: validation.warnings.length > 0 ? (validation.warnings as any) : undefined,
                  createdEntityId: result.id,
                  createdEntityType: entityType,
                  processedAt: new Date(),
                },
              });
              imported++;
            }
          } catch (err: any) {
            await this.prisma.importRow.update({
              where: { id: row.id },
              data: {
                status: 'error',
                validationErrors: [
                  { field: '_system', messageAr: err.message, messageEn: err.message, stage: 'business' },
                ] as any,
                processedAt: new Date(),
              },
            });
            errors++;
          }

          processed++;

          if (processed % 10 === 0) {
            await this.updateProgress(sessionId, processed, totalRows, imported, errors, skipped);
          }
        }
      }

      const finalStatus = errors === 0 ? 'completed' : errors === totalRows ? 'failed' : 'completed_partial';
      await this.prisma.importSession.update({
        where: { id: sessionId },
        data: {
          status: finalStatus,
          importedRows: imported,
          errorRows: errors,
          skippedRows: skipped,
          currentRow: processed,
          completedAt: new Date(),
        },
      });

      this.events.emit('data-migration.completed', { sessionId, imported, errors, skipped });
    } catch (err: any) {
      this.logger.error(`Import ${sessionId} failed: ${err.message}`, err.stack);
      await this.failSession(sessionId, err.message);
    }
  }

  @Process('validate')
  async handleValidation(job: Job<ImportJobData>): Promise<void> {
    const { sessionId, companyId, entityType, mapping, dateFormat } = job.data;

    try {
      await this.prisma.importSession.update({
        where: { id: sessionId },
        data: { status: 'validating' },
      });

      const rows = await this.prisma.importRow.findMany({
        where: { sessionId },
        orderBy: { rowNumber: 'asc' },
      });

      let valid = 0;
      let errorCount = 0;
      let warnings = 0;

      for (const row of rows) {
        const sourceData = row.sourceData as Record<string, unknown>;
        const result = await this.validationPipeline.validateRow(
          sourceData, mapping, entityType, companyId, dateFormat,
        );

        await this.prisma.importRow.update({
          where: { id: row.id },
          data: {
            status: result.status,
            transformedData: result.transformedData as any,
            validationErrors: result.errors.length > 0 ? (result.errors as any) : undefined,
            warnings: result.warnings.length > 0 ? (result.warnings as any) : undefined,
          },
        });

        if (result.status === 'error') errorCount++;
        else if (result.status === 'warning') warnings++;
        else valid++;
      }

      await this.prisma.importSession.update({
        where: { id: sessionId },
        data: {
          status: 'ready',
          validRows: valid + warnings,
          errorRows: errorCount,
          validationSummary: { valid, errors: errorCount, warnings } as any,
        },
      });
    } catch (err: any) {
      this.logger.error(`Validation ${sessionId} failed: ${err.message}`);
      await this.failSession(sessionId, err.message);
    }
  }

  private async updateProgress(
    sessionId: string,
    current: number,
    total: number,
    imported: number,
    errors: number,
    skipped: number,
  ): Promise<void> {
    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: { currentRow: current, importedRows: imported, errorRows: errors, skippedRows: skipped },
    });
    this.events.emit('data-migration.progress', {
      sessionId, current, total, imported, errors, skipped,
      percent: Math.round((current / total) * 100),
    });
  }

  private async failSession(sessionId: string, message: string): Promise<void> {
    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: { status: 'failed', completedAt: new Date(), validationSummary: { error: message } as any },
    });
  }
}
