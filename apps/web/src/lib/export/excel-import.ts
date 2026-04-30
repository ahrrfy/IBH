export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

export async function parseExcelFile(file: File): Promise<ParsedSheet[]> {
  const ExcelJS = await import('exceljs').then((m) => m.default ?? m);
  const wb = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await wb.xlsx.load(buffer);

  const sheets: ParsedSheet[] = [];

  wb.eachSheet((ws) => {
    const headers: string[] = [];
    const rows: Record<string, unknown>[] = [];

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) {
        row.eachCell((cell, colNum) => {
          headers[colNum - 1] = String(cell.value ?? '').trim();
        });
        return;
      }
      const record: Record<string, unknown> = {};
      row.eachCell((cell, colNum) => {
        const h = headers[colNum - 1];
        if (h) record[h] = cell.value;
      });
      if (Object.keys(record).length > 0) rows.push(record);
    });

    sheets.push({ name: ws.name, headers, rows, rowCount: rows.length });
  });

  return sheets;
}

export function parseCsvFile(file: File): Promise<ParsedSheet> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? '';
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) {
        resolve({ name: 'CSV', headers: [], rows: [], rowCount: 0 });
        return;
      }
      const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim());
      const rows = lines.slice(1).map((line) => {
        const values = line.split(',').map((v) => v.replace(/^"|"$/g, '').trim());
        const record: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          record[h] = values[i] ?? '';
        });
        return record;
      });
      resolve({ name: 'CSV', headers, rows, rowCount: rows.length });
    };
    reader.readAsText(file, 'utf-8');
  });
}
