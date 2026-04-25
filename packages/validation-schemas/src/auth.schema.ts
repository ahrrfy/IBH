import { z } from 'zod';
import { passwordSchema } from './common.schema';

// ─── Login ─────────────────────────────────────────────────────────────────
// Accept either email or username (single field). deviceId optional —
// server auto-generates if missing for first-time devices.
export const loginSchema = z.object({
  emailOrUsername: z.string().min(2, 'البريد أو اسم المستخدم مطلوب').max(254),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
  deviceId: z.string().uuid('Invalid device ID').optional(),
  companyCode: z.string().max(10).optional(),
});

// Backward compat — some old clients still send 'email'
export const legacyLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  deviceId: z.string().uuid('Invalid device ID').optional(),
  companyCode: z.string().max(10).optional(),
});

// ─── 2FA / TOTP ───────────────────────────────────────────────────────────
export const totpSetupSchema = z.object({});

export const totpConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'الرمز يجب أن يكون 6 أرقام'),
});

export const totpVerifyLoginSchema = z.object({
  mfaToken: z.string().min(10),
  code: z.string().regex(/^\d{6}$/, 'الرمز يجب أن يكون 6 أرقام'),
});

export const totpDisableSchema = z.object({
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
  code: z.string().regex(/^\d{6}$/, 'الرمز يجب أن يكون 6 أرقام').optional(),
});

// Legacy alias for backwards compat
export const twoFactorSchema = z.object({
  userId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

// ─── Password change ───────────────────────────────────────────────────────
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

// ─── Create user ──────────────────────────────────────────────────────────
export const createUserSchema = z.object({
  email:    z.string().email(),
  username: z.string().min(2).max(40).regex(/^[a-z0-9._-]+$/i, 'Letters, digits, . _ - only').optional(),
  nameAr:   z.string().min(2).max(100),
  nameEn:   z.string().max(100).optional(),
  password: passwordSchema,
  roles:    z.array(z.string()).min(1, 'At least one role is required'),
  branchId: z.string().optional(),
  isActive: z.boolean().default(true),
});

export type LoginInput     = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
