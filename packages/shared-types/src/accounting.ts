import type { ULID, DateISO, DateTimeISO, Money, CurrencyCode } from './common';

// ─── Accounting Types — F2 Philosophy ────────────────────────────────────────
// Double-Entry enforced at DB level. Append-Only. Hash Chain. Period Lock.

/** Iraqi Unified Chart of Accounts top-level categories */
export type AccountCategory =
  | 'fixed_assets'        // 1x — الموجودات الثابتة
  | 'current_assets'      // 2x — الموجودات المتداولة
  | 'liabilities'         // 3x — المطلوبات
  | 'equity'              // 4x — حقوق الملكية
  | 'revenue'             // 5x — الإيرادات
  | 'expense';            // 6x — المصروفات

export type AccountType = 'debit_normal' | 'credit_normal';

/** A GL account in the chart of accounts */
export interface ChartOfAccount {
  id: ULID;
  code: string;            // e.g. "221", "511"
  nameAr: string;
  nameEn?: string;
  category: AccountCategory;
  accountType: AccountType;
  parentId: ULID | null;
  isHeader: boolean;       // header accounts cannot receive direct postings
  isBankAccount: boolean;
  isCashAccount: boolean;
  currency: CurrencyCode;
  companyId: ULID;
  isActive: boolean;
  allowDirectPosting: boolean;
}

/** Accounting Period */
export interface AccountingPeriod {
  id: ULID;
  companyId: ULID;
  year: number;
  month: number;            // 1-12
  startDate: DateISO;
  endDate: DateISO;
  status: 'open' | 'soft_closed' | 'hard_closed';
  closedAt: DateTimeISO | null;
  closedBy: ULID | null;
}

/** Journal Entry header (F2: Append-Only, Hash Chain) */
export interface JournalEntry {
  id: ULID;
  companyId: ULID;
  periodId: ULID;
  entryNumber: string;      // e.g. "JE-RUA-2026-001234"
  entryDate: DateISO;
  description: string;      // mandatory — no silent posting
  referenceType: DocumentType;
  referenceId: ULID;
  totalDebit: Money;
  totalCredit: Money;       // must equal totalDebit (DB constraint)
  status: 'draft' | 'posted' | 'reversed';
  reversalOfId: ULID | null;
  reversedById: ULID | null;
  postedAt: DateTimeISO | null;
  postedBy: ULID | null;
  /** SHA-256(previousHash + entryData) — tamper detection */
  hash: string;
  previousHash: string;
  lines: JournalEntryLine[];
}

/** One debit or credit line in a journal entry */
export interface JournalEntryLine {
  id: ULID;
  journalEntryId: ULID;
  lineNumber: number;
  accountId: ULID;
  accountCode: string;
  accountNameAr: string;
  side: 'debit' | 'credit';
  amount: Money;
  amountIqd: number;        // always stored in IQD for aggregation
  exchangeRate: number;     // rate used for foreign currency
  costCenterId: ULID | null;
  description: string | null;
}

/** Posting profile template — drives automatic journal creation */
export interface PostingProfile {
  id: ULID;
  companyId: ULID;
  transactionType: DocumentType;
  nameAr: string;
  debitAccountId: ULID;
  creditAccountId: ULID;
  /** Secondary entries e.g. COGS on sales */
  secondaryEntries?: {
    debitAccountId: ULID;
    creditAccountId: ULID;
    description: string;
  }[];
  branchId: ULID | null;   // null = applies to all branches
  isActive: boolean;
}

/** All document types that can trigger automatic posting */
export type DocumentType =
  | 'sales_invoice'
  | 'sales_return'
  | 'purchase_invoice'
  | 'purchase_return'
  | 'payment_received'
  | 'payment_made'
  | 'pos_session_close'
  | 'stock_transfer'
  | 'stock_adjustment'
  | 'salary_run'
  | 'asset_depreciation'
  | 'asset_disposal'
  | 'bank_deposit'
  | 'bank_withdrawal'
  | 'expense_claim'
  | 'job_order_wip'
  | 'job_order_complete'
  | 'manual_entry';
