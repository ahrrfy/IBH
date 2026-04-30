import { Injectable, BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { IEntityImporter } from '../importers/importer.interface';
import type { ImportableEntityType } from '../dto/data-migration.dto';
import { ENTITY_LABELS } from '../dto/data-migration.dto';

@Injectable()
export class TemplateGeneratorService {
  private importerMap = new Map<string, IEntityImporter>();

  registerImporters(importers: IEntityImporter[]): void {
    for (const imp of importers) {
      this.importerMap.set(imp.entityType, imp);
    }
  }

  async generateTemplate(entityType: ImportableEntityType): Promise<Buffer> {
    const importer = this.importerMap.get(entityType);
    if (!importer) {
      throw new BadRequestException(`Unknown entity type: ${entityType}`);
    }

    const columns = importer.getTemplateColumns();
    const label = ENTITY_LABELS[entityType];
    const workbook = new ExcelJS.Workbook();

    const sheet = workbook.addWorksheet(label.ar);
    sheet.views = [{ rightToLeft: true }];

    // Row 1: Arabic headers (bold + colored)
    const row1 = sheet.addRow(columns.map((c) => c.labelAr));
    row1.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    row1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    row1.alignment = { horizontal: 'center' };

    // Row 2: English headers
    const row2 = sheet.addRow(columns.map((c) => c.labelEn));
    row2.font = { italic: true, size: 10, color: { argb: 'FF808080' } };

    // Row 3: Instructions (type + required/optional)
    const row3 = sheet.addRow(
      columns.map((c) => `${c.type} — ${c.required ? 'إلزامي / Required' : 'اختياري / Optional'}`),
    );
    row3.font = { size: 9, color: { argb: 'FF999999' } };
    row3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

    // Rows 4-6: Examples
    sheet.addRow(columns.map((c) => c.example));
    sheet.addRow(columns.map(() => ''));
    sheet.addRow(columns.map(() => ''));

    // Auto-fit
    columns.forEach((col, idx) => {
      const maxLen = Math.max(col.labelAr.length, col.labelEn.length, col.example.length, 15);
      sheet.getColumn(idx + 1).width = Math.min(maxLen + 5, 50);
    });

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
