import type { ExportOptions } from './types';

export async function exportToExcel(options: ExportOptions) {
  const ExcelJS = (await import('exceljs')).default;
  const { saveAs } = await import('file-saver');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Al-Ruya ERP';
  wb.created = new Date();

  const ws = wb.addWorksheet(options.sheetName ?? 'البيانات');
  ws.views = [{ rightToLeft: options.direction !== 'ltr' }];

  let rowIdx = 1;

  if (options.company) {
    const c = options.company;
    const merge = (row: number, text: string, bold = false, size = 12) => {
      ws.mergeCells(row, 1, row, options.columns.length);
      const cell = ws.getCell(row, 1);
      cell.value = text;
      cell.font = { bold, size, name: 'Cairo' };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    };
    merge(rowIdx++, c.nameAr, true, 16);
    if (c.address) merge(rowIdx++, c.address, false, 10);
    if (c.phone) merge(rowIdx++, `هاتف: ${c.phone}`, false, 10);
    if (c.taxNumber) merge(rowIdx++, `رقم ضريبي: ${c.taxNumber}`, false, 10);
    rowIdx++;
  }

  if (options.title) {
    ws.mergeCells(rowIdx, 1, rowIdx, options.columns.length);
    const cell = ws.getCell(rowIdx, 1);
    cell.value = options.title;
    cell.font = { bold: true, size: 14, name: 'Cairo', color: { argb: 'FF1E3A5F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    rowIdx++;
    if (options.subtitle) {
      ws.mergeCells(rowIdx, 1, rowIdx, options.columns.length);
      const sub = ws.getCell(rowIdx, 1);
      sub.value = options.subtitle;
      sub.font = { size: 10, name: 'Cairo', color: { argb: 'FF666666' } };
      sub.alignment = { horizontal: 'center' };
      rowIdx++;
    }
    rowIdx++;
  }

  const headerRow = ws.getRow(rowIdx);
  options.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Cairo', size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { horizontal: col.align ?? 'right', vertical: 'middle' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF1E3A5F' } },
    };
  });
  headerRow.height = 28;
  rowIdx++;

  const totals: Record<number, number> = {};

  options.rows.forEach((row) => {
    const dataRow = ws.getRow(rowIdx);
    options.columns.forEach((col, i) => {
      const val = col.exportValue(row);
      const cell = dataRow.getCell(i + 1);
      cell.value = val ?? '';
      cell.font = { name: 'Cairo', size: 10 };
      cell.alignment = { horizontal: col.align ?? 'right', vertical: 'middle' };

      if (col.type === 'currency' && typeof val === 'number') {
        cell.numFmt = '#,##0 "د.ع"';
        totals[i] = (totals[i] ?? 0) + val;
      } else if (col.type === 'percentage' && typeof val === 'number') {
        cell.numFmt = '0.0%';
      } else if (col.type === 'number' && typeof val === 'number') {
        cell.numFmt = '#,##0';
        totals[i] = (totals[i] ?? 0) + val;
      }
    });
    rowIdx++;
  });

  if (options.showTotals && Object.keys(totals).length > 0) {
    const totalRow = ws.getRow(rowIdx);
    totalRow.getCell(1).value = 'الإجمالي';
    totalRow.getCell(1).font = { bold: true, name: 'Cairo', size: 11 };
    Object.entries(totals).forEach(([idx, val]) => {
      const cell = totalRow.getCell(Number(idx) + 1);
      cell.value = val;
      cell.font = { bold: true, name: 'Cairo', size: 11 };
      const colDef = options.columns[Number(idx)];
      if (colDef?.type === 'currency') cell.numFmt = '#,##0 "د.ع"';
      else cell.numFmt = '#,##0';
    });
    totalRow.eachCell((cell) => {
      cell.border = { top: { style: 'double', color: { argb: 'FF1E3A5F' } } };
    });
  }

  options.columns.forEach((col, i) => {
    const maxLen = Math.max(
      col.header.length,
      ...options.rows.slice(0, 50).map((r) => String(col.exportValue(r) ?? '').length),
    );
    ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 4, 10), 40);
  });

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${options.filename}.xlsx`);
}
