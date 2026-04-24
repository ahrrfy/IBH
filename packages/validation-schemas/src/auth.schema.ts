import { z } from 'zod';
import { passwordSchema } from './common.schema';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  deviceId: z.string().uuid('Invalid device ID'),
  companyCode: z.string().max(10).optional(),
});

export const twoFactorSchema = z.object({
  userId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const createUserSchema = z.object({
  email: z.string().email(),
  nameAr: z.string().min(2).max(100),
  nameEn: z.string().max(100).optional(),
  password: passwordSchema,
  roles: z.array(z.string()).min(1, 'At least one role is required'),
  branchId: z.string().optional(),
  isActive: z.boolean().default(true),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
