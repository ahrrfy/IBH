import { z } from 'zod';

/**
 * T64 — DTOs for the License Activation controller.
 *
 * All input validation is centralised here so the controller stays a
 * thin transport adapter. Schemas are exported alongside their inferred
 * TypeScript types — controllers use the type for `@Body()`, the schema
 * for `ZodValidationPipe`.
 */

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const FINGERPRINT_HASH_REGEX = /^[0-9a-f]{64}$/;

/** `POST /licensing/activation/issue` — super-admin only. */
export const issueLicenseSchema = z
  .object({
    companyId: z.string().regex(ULID_REGEX, 'companyId must be a ULID'),
    planId: z.string().regex(ULID_REGEX, 'planId must be a ULID'),
    /** How many days the license is valid from `validFrom` (default: now). */
    durationDays: z
      .number()
      .int()
      .positive()
      .max(366 * 10, 'durationDays cannot exceed 10 years'),
    /** Optional override — defaults to the plan's `maxUsers` or 1. */
    maxDevices: z.number().int().positive().max(10_000).optional(),
    /** Optional ISO-8601 start date — defaults to the issue moment. */
    validFrom: z.string().datetime().optional(),
  })
  .strict();
export type IssueLicenseInput = z.infer<typeof issueLicenseSchema>;

/** `POST /licensing/activation/activate` — public + rate-limited. */
export const activateLicenseSchema = z
  .object({
    licenseKey: z.string().min(50, 'licenseKey looks too short'),
    fingerprint: z
      .string()
      .regex(FINGERPRINT_HASH_REGEX, 'fingerprint must be 64-char lowercase hex'),
    deviceLabel: z.string().min(1).max(200).optional(),
  })
  .strict();
export type ActivateLicenseInput = z.infer<typeof activateLicenseSchema>;

/** `POST /licensing/activation/renew` — auth required (existing license). */
export const renewLicenseSchema = z
  .object({
    currentLicenseKey: z.string().min(50),
    fingerprint: z.string().regex(FINGERPRINT_HASH_REGEX),
  })
  .strict();
export type RenewLicenseInput = z.infer<typeof renewLicenseSchema>;

/** `POST /licensing/activation/revoke` — super-admin only. */
export const revokeLicenseSchema = z
  .object({
    licenseKeyId: z.string().regex(ULID_REGEX),
    reason: z.string().min(1).max(500).optional(),
  })
  .strict();
export type RevokeLicenseInput = z.infer<typeof revokeLicenseSchema>;
