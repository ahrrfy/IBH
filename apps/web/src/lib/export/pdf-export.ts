import type { ExportOptions } from './types';

export async function exportToPdf(options: ExportOptions) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setR2L(true);

  let startY = 15;

  if (options.company) {
    doc.setFontSize(16);
    doc.text(options.company.nameAr, doc.internal.pageSize.width / 2, startY, { align: 'center' });
    startY += 7;
    if (options.company.address) {
      doc.setFontSize(9);
      doc.text(options.company.address, doc.internal.pageSize.width / 2, startY, { align: 'center' });
      startY += 5;
    }
    if (options.company.phone) {
      doc.setFontSize(9);
      doc.text(options.company.phone, doc.internal.pageSize.width / 2, startY, { align: 'center' });
      startY += 5;
    }
    startY += 3;
  }

  if (options.title) {
    doc.setFontSize(14);
    doc.text(options.title, doc.internal.pageSize.width / 2, startY, { align: 'center' });
    startY += 8;
  }

  const headers = options.columns.map((c) => c.header);
  const body = options.rows.map((row) =>
    options.columns.map((c) => {
      const val = c.exportValue(row);
      if (val == null) return '';
      if (typeof val === 'number') return val.toLocaleString('ar-IQ');
      return String(val);
    }),
  );

  const columnStyles: Record<number, { halign: 'left' | 'right' | 'center' }> = {};
  options.columns.forEach((c, i) => {
    columnStyles[i] = { halign: c.align === 'left' ? 'left' : c.align === 'center' ? 'center' : 'right' };
  });

  autoTable(doc, {
    head: [headers],
    body,
    startY,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, halign: 'right', overflow: 'linebreak' },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold', halign: 'right' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles,
    didDrawPage: (data: any) => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.text(
        `${currentPage} / ${pageCount}`,
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 8,
        { align: 'center' },
      );
      doc.text(
        new Date().toLocaleDateString('ar-IQ'),
        15,
        doc.internal.pageSize.height - 8,
      );
    },
  });

  doc.save(`${options.filename}.pdf`);
}
