import { z } from 'zod';

/**
 * Zod schemas for the Sales Commissions & Incentives module (T43).
 *
 * F1 — every input is Zod-validated before reaching the service layer.
 */

export const commissionRuleSchema = z
  .object({
    fromAmount: z.number().nonnegative().optional(),
    toAmount: z.number().nonnegative().optional(),
    productId: z.string().length(26).optional(),
    categoryId: z.string().length(26).optional(),
    pct: z.number().min(0).max(100),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .strict();

export const createPlanSchema = z
  .object({
    code: z.string().min(1).max(40),
    nameAr: z.string().min(1).max(200),
    nameEn: z.string().max(200).optional(),
    basis: z.enum(['sales', 'margin']).default('sales'),
    kind: z.enum(['flat', 'tiered', 'product']).default('flat'),
    flatPct: z.number().min(0).max(100).default(0),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional(),
    notes: z.string().max(2000).optional(),
    rules: z.array(commissionRuleSchema).default([]),
  })
  .strict();

export const updatePlanSchema = createPlanSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const assignPlanSchema = z
  .object({
    planId: z.string().length(26),
    employeeId: z.string().length(26).optional(),
    promoterName: z.string().min(1).max(200).optional(),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.employeeId) !== Boolean(v.promoterName),
    'exactly one of employeeId or promoterName is required',
  );

export const manualEntrySchema = z
  .object({
    planId: z.string().length(26),
    employeeId: z.string().length(26).optional(),
    promoterName: z.string().min(1).max(200).optional(),
    kind: z.enum(['accrual', 'clawback', 'adjustment']),
    refType: z.string().min(1).max(50).default('Manual'),
    refId: z.string().length(26).optional(),
    baseAmountIqd: z.number(),
    pctApplied: z.number().min(0).max(100),
    amountIqd: z.number(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export type CreatePlanDto = z.infer<typeof createPlanSchema>;
export type UpdatePlanDto = z.infer<typeof updatePlanSchema>;
export type AssignPlanDto = z.infer<typeof assignPlanSchema>;
export type ManualEntryDto = z.infer<typeof manualEntrySchema>;
