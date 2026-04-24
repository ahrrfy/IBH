import { z } from 'zod';
import { loginSchema } from '@erp/validation-schemas';

// Re-export inferred type for NestJS
export type LoginDto = z.infer<typeof loginSchema>;
