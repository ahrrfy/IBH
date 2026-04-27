import { z } from 'zod';

/** Job posting create — admin only. */
export const CreateJobPostingSchema = z.object({
  branchId: z.string().length(26).optional(),
  departmentId: z.string().length(26).optional(),
  slug: z
    .string()
    .min(3)
    .max(150)
    .regex(/^[a-z0-9-]+$/, { message: 'slug must be lowercase alphanumeric with dashes' }),
  titleAr: z.string().min(2).max(200),
  titleEn: z.string().max(200).optional(),
  descriptionAr: z.string().min(10),
  requirementsAr: z.string().optional(),
  /** Comma-separated keywords used by the rule-based auto-screen scorer. */
  keywords: z.string().max(1000).optional(),
  minYearsExperience: z.number().int().min(0).max(50).default(0),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'internship']).default('full_time'),
  salaryMinIqd: z.union([z.number(), z.string()]).optional(),
  salaryMaxIqd: z.union([z.number(), z.string()]).optional(),
  location: z.string().max(200).optional(),
});
export type CreateJobPostingDto = z.infer<typeof CreateJobPostingSchema>;

export const UpdateJobPostingSchema = CreateJobPostingSchema.partial();
export type UpdateJobPostingDto = z.infer<typeof UpdateJobPostingSchema>;

/** Public application submission — no auth, rate-limited at controller level. */
export const SubmitApplicationSchema = z.object({
  applicantName: z.string().min(2).max(200),
  applicantEmail: z.string().email().max(200),
  applicantPhone: z.string().max(30).optional(),
  yearsExperience: z.number().int().min(0).max(60).default(0),
  /** URL of CV uploaded earlier (e.g. MinIO presigned PUT). */
  cvUrl: z.string().url().max(500).optional(),
  /** Free-text CV body (paste / OCR). Used for rule-based keyword screening. */
  cvText: z.string().max(50_000).optional(),
  coverLetter: z.string().max(20_000).optional(),
});
export type SubmitApplicationDto = z.infer<typeof SubmitApplicationSchema>;

/** Internal review — move application through the kanban. */
export const TransitionApplicationSchema = z.object({
  toStatus: z.enum(['new', 'screened', 'interview', 'offer', 'hired', 'rejected']),
  rejectionReason: z.string().max(500).optional(),
});
export type TransitionApplicationDto = z.infer<typeof TransitionApplicationSchema>;

export const ScheduleInterviewSchema = z.object({
  roundNumber: z.number().int().min(1).max(10),
  scheduledAt: z.union([z.string(), z.date()]).optional(),
  interviewerId: z.string().length(26).optional(),
  notes: z.string().max(2000).optional(),
});
export type ScheduleInterviewDto = z.infer<typeof ScheduleInterviewSchema>;

export const RecordInterviewOutcomeSchema = z.object({
  outcome: z.enum(['pending', 'passed', 'failed', 'no_show']),
  score: z.number().int().min(0).max(10).optional(),
  notes: z.string().max(2000).optional(),
});
export type RecordInterviewOutcomeDto = z.infer<typeof RecordInterviewOutcomeSchema>;

export const CreateOfferLetterSchema = z.object({
  proposedSalaryIqd: z.union([z.number(), z.string()]),
  startDate: z.union([z.string(), z.date()]),
  expiresAt: z.union([z.string(), z.date()]),
  notes: z.string().max(5000).optional(),
});
export type CreateOfferLetterDto = z.infer<typeof CreateOfferLetterSchema>;
