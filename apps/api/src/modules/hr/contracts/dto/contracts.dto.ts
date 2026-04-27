import { z } from 'zod';

/** Contract template — admin only. */
export const CreateContractTemplateSchema = z.object({
  code: z.string().min(2).max(40).regex(/^[A-Z0-9_-]+$/, {
    message: 'code must be uppercase alphanumeric',
  }),
  nameAr: z.string().min(2).max(200),
  bodyMd: z.string().min(20).max(50_000),
  renewDays: z.number().int().min(1).max(365).default(30),
});
export type CreateContractTemplateDto = z.infer<typeof CreateContractTemplateSchema>;

export const UpdateContractTemplateSchema = CreateContractTemplateSchema.partial();
export type UpdateContractTemplateDto = z.infer<typeof UpdateContractTemplateSchema>;

/** Issue an employment contract from a template. */
export const CreateContractSchema = z.object({
  templateId: z.string().length(26),
  employeeId: z.string().length(26),
  /** Optional — if set, links the new contract to an accepted offer letter. */
  offerLetterId: z.string().length(26).optional(),
  contractNo: z.string().min(2).max(40),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  salaryIqd: z.union([z.number().nonnegative(), z.string()]),
});
export type CreateContractDto = z.infer<typeof CreateContractSchema>;
