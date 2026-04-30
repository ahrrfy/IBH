export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
  type?: 'string' | 'number' | 'currency' | 'date' | 'percentage';
  align?: 'right' | 'center' | 'left';
  exportValue: (row: any) => string | number | Date | null | undefined;
}

export interface CompanyHeader {
  nameAr: string;
  nameEn?: string;
  address?: string | null;
  phone?: string | null;
  taxNumber?: string | null;
}

export interface ExportOptions {
  filename: string;
  sheetName?: string;
  title?: string;
  subtitle?: string;
  company?: CompanyHeader;
  columns: ExportColumn[];
  rows: any[];
  direction?: 'rtl' | 'ltr';
  showTotals?: boolean;
}
