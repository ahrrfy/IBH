// ─── Common Primitives ────────────────────────────────────────────────────────
// ULID is used for ALL primary keys (sequential + offline-safe, Decision D08)

export type ULID = string; // 26-char Crockford base32

export type IQD = number;  // Iraqi Dinar — always stored as integer fils (×1000)
export type USD = number;  // US Dollar  — stored as cents (×100)

export type CurrencyCode = 'IQD' | 'USD' | 'EUR' | string;

/** Money value with its currency */
export interface Money {
  amount: number;       // smallest unit (fils for IQD, cents for USD)
  currency: CurrencyCode;
  /** Human-readable formatted string — NEVER use for calculations */
  formatted?: string;
}

export type Locale = 'ar' | 'en' | 'ku';

export type DateISO = string; // ISO-8601 date: "2026-04-23"
export type DateTimeISO = string; // ISO-8601 datetime with TZ

/** Arabic + English bilingual name */
export interface BilingualName {
  nameAr: string;
  nameEn?: string;
}

/** Soft-delete marker — NO hard deletes on financial tables */
export interface SoftDeletable {
  deletedAt: DateTimeISO | null;
  deletedBy: ULID | null;
}

/** Standard created/updated tracking */
export interface Timestamped {
  createdAt: DateTimeISO;
  updatedAt: DateTimeISO;
}

/** Every entity that follows our audit pattern */
export interface Auditable extends Timestamped, SoftDeletable {
  createdBy: ULID;
  updatedBy: ULID;
}

/** Generic key-value metadata bag */
export type Metadata = Record<string, string | number | boolean | null>;

/** File attachment stored in MinIO */
export interface Attachment {
  id: ULID;
  bucket: string;
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: ULID;
  uploadedAt: DateTimeISO;
  /** Presigned URL — ephemeral, never store */
  url?: string;
}
