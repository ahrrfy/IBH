export interface SheetInfo {
  name: string;
  rowCount: number;
}

export interface ParseResult {
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

export interface IFileParser {
  listSheets(buffer: Buffer): Promise<SheetInfo[]>;
  parse(buffer: Buffer, sheetName?: string): Promise<ParseResult>;
}
