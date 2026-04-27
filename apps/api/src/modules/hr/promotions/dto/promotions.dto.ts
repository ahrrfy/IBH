import { z } from 'zod';

// ── Salary Band DTOs ────────────────────────────────────────────────────────

export const CreateSalaryBandSchema = z.object({
  grade: z.string().min(1).max(10),
  band: z.string().min(1).max(5),
  nameAr: z.string().min(1).max(100),
  minIqd: z.number().positive(),
  midIqd: z.number().positive(),
  maxIqd: z.number().positive(),
});
export type CreateSalaryBandDto = z.infer<typeof CreateSalaryBandSchema>;

export const UpdateSalaryBandSchema = z.object({
  nameAr: z.string().min(1).max(100).optional(),
  minIqd: z.number().positive().optional(),
  midIqd: z.number().positive().optional(),
  maxIqd: z.number().positive().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSalaryBandDto = z.infer<typeof UpdateSalaryBandSchema>;

// ── Promotion DTOs ──────────────────────────────────────────────────────────

export const CreatePromotionSchema = z.object({
  employeeId: z.string().length(26),
  toPayGradeId: z.string().length(26).optional(),
  toSalaryBandId: z.string().length(26).optional(),
  toPositionTitle: z.string().min(1).max(100).optional(),
  toSalaryIqd: z.number().positive(),
  effectiveDate: z.string().date(), // ISO date string YYYY-MM-DD
  reason: z.string().max(500).optional(),
});
export type CreatePromotionDto = z.infer<typeof CreatePromotionSchema>;

export const SubmitPromotionSchema = z.object({
  id: z.string().length(26),
});

export const ApprovePromotionSchema = z.object({
  note: z.string().max(500).optional(),
});
export type ApprovePromotionDto = z.infer<typeof ApprovePromotionSchema>;

export const RejectPromotionSchema = z.object({
  note: z.string().max(500),
});
export type RejectPromotionDto = z.infer<typeof RejectPromotionSchema>;
