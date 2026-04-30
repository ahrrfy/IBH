import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { IFileParser, SheetInfo, ParseResult } from './parser.interface';

@Injectable()
export class XlsxParser implements IFileParser {
  async listSheets(buffer: Buffer): Promise<SheetInfo[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheets: SheetInfo[] = [];
    workbook.eachSheet((ws) => {
      if (ws.rowCount > 1) {
        sheets.push({ name: ws.name, rowCount: Math.max(0, ws.rowCount - 1) });
      }
    });
    return sheets;
  }

  async parse(buffer: Buffer, sheetName?: string): Promise<ParseResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const ws = sheetName
      ? workbook.getWorksheet(sheetName)
      : workbook.worksheets.find((s) => s.rowCount > 1);

    if (!ws) {
      return { headers: [], rows: [], totalRows: 0 };
    }

    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headers[colNumber - 1] = String(this.extractCellValue(cell)).trim();
    });

    const rows: Record<string, unknown>[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const record: Record<string, unknown> = {};
      let hasData = false;

      headers.forEach((header, idx) => {
        if (!header) return;
        const cell = row.getCell(idx + 1);
        const val = this.extractCellValue(cell);
        if (val !== null && val !== undefined && val !== '') hasData = true;
        record[header] = val;
      });

      if (hasData) rows.push(record);
    }

    return { headers: headers.filter(Boolean), rows, totalRows: rows.length };
  }

  private extractCellValue(cell: ExcelJS.Cell): unknown {
    if (cell.type === ExcelJS.ValueType.Formula) {
      return (cell.value as ExcelJS.CellFormulaValue)?.result ?? null;
    }
    if (cell.type === ExcelJS.ValueType.RichText) {
      return (cell.value as ExcelJS.CellRichTextValue)?.richText
        ?.map((rt) => rt.text)
        .join('') ?? null;
    }
    if (cell.type === ExcelJS.ValueType.Hyperlink) {
      return (cell.value as ExcelJS.CellHyperlinkValue)?.text ?? null;
    }
    if (cell.value instanceof Date) {
      return cell.value;
    }
    return cell.value ?? null;
  }
}
