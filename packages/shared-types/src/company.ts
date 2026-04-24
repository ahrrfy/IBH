import type { ULID, DateISO, Auditable, CurrencyCode } from './common';

// ─── Multi-Tenant Company & Branch Types ──────────────────────────────────────

/** Top-level tenant — full data isolation via PostgreSQL RLS */
export interface Company extends Auditable {
  id: ULID;
  code: string;              // short code: "RUA"
  nameAr: string;
  nameEn?: string;
  logoUrl: string | null;
  commercialRegNumber: string | null;
  taxNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  primaryCurrency: CurrencyCode;    // IQD
  secondaryCurrency: CurrencyCode;  // USD
  fiscalYearStart: number;   // month: 1 = January
  timezone: string;          // "Asia/Baghdad"
  locale: 'ar' | 'en' | 'ku';
  isActive: boolean;
  plan: LicensePlan;
}

export type LicensePlan = 'trial' | 'starter' | 'business' | 'enterprise';

/** Branch within a company */
export interface Branch extends Auditable {
  id: ULID;
  companyId: ULID;
  code: string;              // e.g. "BGD", "ARB"
  nameAr: string;
  nameEn?: string;
  address: string | null;
  phone: string | null;
  city: string | null;
  isMainBranch: boolean;
  isActive: boolean;
  workingHoursStart: string | null;  // "08:00"
  workingHoursEnd: string | null;    // "22:00"
  /** Default printer configuration */
  defaultPrinterConfig: PrinterConfig | null;
}

export interface PrinterConfig {
  printerName: string;
  paperSize: '58mm' | '80mm' | 'A4' | 'A5' | 'label_30x20';
  type: 'thermal' | 'laser' | 'label';
  hasCashDrawer: boolean;
  cashDrawerPort: string | null;
}

/** Exchange rate — manual entry, full history retained */
export interface ExchangeRate {
  id: ULID;
  companyId: ULID;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  buyRate: number | null;
  sellRate: number | null;
  effectiveDate: DateISO;
  source: 'manual' | 'api';
  createdBy: ULID;
  createdAt: string;
}

/** Cost center for expense allocation */
export interface CostCenter extends Auditable {
  id: ULID;
  companyId: ULID;
  code: string;
  nameAr: string;
  nameEn?: string;
  parentId: ULID | null;
  type: 'branch' | 'department' | 'project' | 'product_line';
  isActive: boolean;
}
