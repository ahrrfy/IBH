import { z } from 'zod';

export const CreatePolicySchema = z.object({
  code: z.string().min(2).max(40).regex(/^[A-Z0-9_-]+$/),
  titleAr: z.string().min(2).max(200),
  bodyMd: z.string().min(10).max(50_000),
});
export type CreatePolicyDto = z.infer<typeof CreatePolicySchema>;

export const UpdatePolicySchema = z.object({
  titleAr: z.string().min(2).max(200).optional(),
  bodyMd: z.string().min(10).max(50_000).optional(),
});
export type UpdatePolicyDto = z.infer<typeof UpdatePolicySchema>;

/** Employee-side: acknowledge a published policy version. */
export const AcknowledgePolicySchema = z.object({
  policyId: z.string().length(26),
  policyVersion: z.number().int().min(1),
});
export type AcknowledgePolicyDto = z.infer<typeof AcknowledgePolicySchema>;
