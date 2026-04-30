import { Injectable, BadRequestException } from '@nestjs/common';
import type { IFileParser, SheetInfo, ParseResult } from './parser.interface';

@Injectable()
export class JsonParser implements IFileParser {
  async listSheets(_buffer: Buffer): Promise<SheetInfo[]> {
    return [{ name: 'JSON', rowCount: 0 }];
  }

  async parse(buffer: Buffer): Promise<ParseResult> {
    let data: unknown;
    try {
      data = JSON.parse(buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException({
        code: 'INVALID_JSON',
        messageAr: 'ملف JSON غير صالح',
        messageEn: 'Invalid JSON file',
      });
    }

    const arr = Array.isArray(data) ? data : [data];
    if (arr.length === 0 || typeof arr[0] !== 'object' || arr[0] === null) {
      throw new BadRequestException({
        code: 'INVALID_JSON_STRUCTURE',
        messageAr: 'يجب أن يكون الملف مصفوفة من الكائنات',
        messageEn: 'File must be an array of objects',
      });
    }

    const headers = [...new Set(arr.flatMap((obj) => Object.keys(obj as object)))];
    return {
      headers,
      rows: arr as Record<string, unknown>[],
      totalRows: arr.length,
    };
  }
}
