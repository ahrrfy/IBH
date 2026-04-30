import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../platform/prisma/prisma.service';

@Injectable()
export class ErrorReportService {
  constructor(private readonly prisma: PrismaService) {}

  async generateErrorReport(sessionId: string): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Errors
    const errorSheet = workbook.addWorksheet('الأخطاء');
    errorSheet.views = [{ rightToLeft: true }];
    errorSheet.columns = [
      { header: 'رقم السطر', key: 'rowNumber', width: 12 },
      { header: 'الحقل', key: 'field', width: 20 },
      { header: 'سبب الخطأ (عربي)', key: 'messageAr', width: 40 },
      { header: 'سبب الخطأ (English)', key: 'messageEn', width: 40 },
      { header: 'المرحلة', key: 'stage', width: 15 },
      { header: 'اقتراح الإصلاح', key: 'suggestion', width: 40 },
      { header: 'البيانات الأصلية', key: 'sourceData', width: 60 },
    ];
    this.styleHeader(errorSheet);

    const errorRows = await this.prisma.importRow.findMany({
      where: { sessionId, status: 'error' },
      orderBy: { rowNumber: 'asc' },
    });
    for (const row of errorRows) {
      const errors = (row.validationErrors as any[]) ?? [];
      for (const err of errors) {
        errorSheet.addRow({
          rowNumber: row.rowNumber,
          field: err.field,
          messageAr: err.messageAr,
          messageEn: err.messageEn,
          stage: err.stage,
          suggestion: err.suggestion ?? '',
          sourceData: JSON.stringify(row.sourceData),
        });
      }
    }

    // Sheet 2: Duplicates
    const dupSheet = workbook.addWorksheet('التكرارات');
    dupSheet.views = [{ rightToLeft: true }];
    dupSheet.columns = [
      { header: 'رقم السطر', key: 'rowNumber', width: 12 },
      { header: 'مُكرر مع', key: 'duplicateOfId', width: 30 },
      { header: 'البيانات', key: 'sourceData', width: 60 },
    ];
    this.styleHeader(dupSheet);
    const dupRows = await this.prisma.importRow.findMany({
      where: { sessionId, status: 'skipped', duplicateOfId: { not: null } },
      orderBy: { rowNumber: 'asc' },
    });
    for (const row of dupRows) {
      dupSheet.addRow({
        rowNumber: row.rowNumber,
        duplicateOfId: row.duplicateOfId,
        sourceData: JSON.stringify(row.sourceData),
      });
    }

    // Sheet 3: Warnings
    const warnSheet = workbook.addWorksheet('التحذيرات');
    warnSheet.views = [{ rightToLeft: true }];
    warnSheet.columns = [
      { header: 'رقم السطر', key: 'rowNumber', width: 12 },
      { header: 'الحقل', key: 'field', width: 20 },
      { header: 'التحذير', key: 'messageAr', width: 40 },
      { header: 'Warning', key: 'messageEn', width: 40 },
    ];
    this.styleHeader(warnSheet);
    const warnRows = await this.prisma.importRow.findMany({
      where: { sessionId, status: 'warning' },
      orderBy: { rowNumber: 'asc' },
    });
    for (const row of warnRows) {
      const warnings = (row.warnings as any[]) ?? [];
      for (const w of warnings) {
        warnSheet.addRow({
          rowNumber: row.rowNumber,
          field: w.field,
          messageAr: w.messageAr,
          messageEn: w.messageEn,
        });
      }
    }

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  private styleHeader(sheet: ExcelJS.Worksheet): void {
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
    headerRow.alignment = { horizontal: 'center' };
  }
}
