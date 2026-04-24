import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

/**
 * Validates request body/params/query against a Zod schema.
 * Returns parsed + transformed value (Zod's safe output).
 *
 * @example
 * @Body(new ZodValidationPipe(loginSchema))
 * body: LoginInput
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const errors = this.formatErrors(result.error);
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'بيانات غير صحيحة',
        errors,
      });
    }

    return result.data;
  }

  private formatErrors(error: ZodError): Record<string, string[]> {
    const formatted: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const path = issue.path.join('.') || 'root';
      if (!formatted[path]) formatted[path] = [];
      formatted[path].push(issue.message);
    }
    return formatted;
  }
}
