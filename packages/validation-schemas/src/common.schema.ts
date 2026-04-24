import { z } from 'zod';

// ─── Common reusable Zod schemas ──────────────────────────────────────────────

/** ULID: 26 uppercase Crockford base32 chars */
export const ulidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid ULID format');

/** ISO date "YYYY-MM-DD" */
export const dateIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

/** ISO datetime with timezone */
export const datetimeIsoSchema = z.string().datetime({ offset: true });

/** IQD amount — non-negative integer (stored as fils ×1000) */
export const iqdAmountSchema = z
  .number()
  .int('IQD amount must be integer (fils)')
  .nonnegative('Amount must be non-negative');

/** Currency code */
export const currencyCodeSchema = z.enum(['IQD', 'USD', 'EUR']).or(z.string().min(3).max(3));

/** Money object */
export const moneySchema = z.object({
  amount: z.number().nonnegative(),
  currency: currencyCodeSchema,
});

/** Bilingual name */
export const bilingualNameSchema = z.object({
  nameAr: z.string().min(1, 'Arabic name is required').max(200),
  nameEn: z.string().max(200).optional(),
});

/** Phone number — Iraqi format */
export const phoneSchema = z
  .string()
  .regex(/^(\+964|00964|0)?[7-9]\d{9}$/, 'Invalid Iraqi phone number')
  .optional();

/** Strong password: min 10 chars, 1 uppercase, 1 number, 1 special */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

/** Positive quantity */
export const qtySchema = z
  .number()
  .positive('Quantity must be positive')
  .finite('Quantity must be a finite number');

/** Pagination */
export const paginationSchema = z.object({
  cursor: ulidSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
  direction: z.enum(['asc', 'desc']).default('desc'),
});
