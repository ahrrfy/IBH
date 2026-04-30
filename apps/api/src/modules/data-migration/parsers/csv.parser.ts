import { Injectable } from '@nestjs/common';
import * as Papa from 'papaparse';
import type { IFileParser, SheetInfo, ParseResult } from './parser.interface';

@Injectable()
export class CsvParser implements IFileParser {
  async listSheets(_buffer: Buffer): Promise<SheetInfo[]> {
    return [{ name: 'CSV', rowCount: 0 }];
  }

  async parse(buffer: Buffer): Promise<ParseResult> {
    const text = buffer.toString('utf-8');
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h: string) => h.trim(),
    });

    return {
      headers: result.meta.fields ?? [],
      rows: result.data as Record<string, unknown>[],
      totalRows: result.data.length,
    };
  }
}
