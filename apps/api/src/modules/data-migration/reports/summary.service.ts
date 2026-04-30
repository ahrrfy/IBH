import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { ENTITY_LABELS } from '../dto/data-migration.dto';
import type { ImportableEntityType } from '../dto/data-migration.dto';

export interface ImportSummary {
  sessionId: string;
  entityType: string;
  entityLabel: { ar: string; en: string };
  total: number;
  imported: number;
  errors: number;
  skipped: number;
  warnings: number;
  duration: string;
  canRollback: boolean;
}

@Injectable()
export class SummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(sessionId: string): Promise<ImportSummary> {
    const session = await this.prisma.importSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');

    const warningCount = await this.prisma.importRow.count({
      where: { sessionId, status: 'warning' },
    });

    return {
      sessionId,
      entityType: session.entityType,
      entityLabel:
        ENTITY_LABELS[session.entityType as ImportableEntityType] ?? {
          ar: session.entityType,
          en: session.entityType,
        },
      total: session.totalRows,
      imported: session.importedRows,
      errors: session.errorRows,
      skipped: session.skippedRows,
      warnings: warningCount,
      duration: this.formatDuration(session.startedAt, session.completedAt),
      canRollback:
        ['completed', 'completed_partial'].includes(session.status) && !session.rolledBackAt,
    };
  }

  private formatDuration(start: Date | null, end: Date | null): string {
    if (!start || !end) return '—';
    const ms = end.getTime() - start.getTime();
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
}
