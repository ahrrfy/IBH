import { Injectable } from '@nestjs/common';
import { ENTITY_FIELD_REGISTRY } from '../mappers/entity-field-registry';
import type { ImportableEntityType } from '../dto/data-migration.dto';

export interface ValidationError {
  field: string;
  messageAr: string;
  messageEn: string;
  stage: 'format' | 'schema' | 'business' | 'referential';
  suggestion?: string;
}

@Injectable()
export class FormatValidator {
  validate(row: Record<string, unknown>, entityType: ImportableEntityType): ValidationError[] {
    const errors: ValidationError[] = [];
    const fields = ENTITY_FIELD_REGISTRY[entityType];
    if (!fields) return errors;

    for (const field of fields) {
      const value = row[field.field];
      const isEmpty = value === null || value === undefined || String(value).trim() === '';

      if (field.required && isEmpty) {
        errors.push({
          field: field.field,
          messageAr: `الحقل "${field.labelAr}" إلزامي`,
          messageEn: `Field "${field.labelEn}" is required`,
          stage: 'format',
          suggestion: `أضف قيمة. مثال: ${field.example}`,
        });
        continue;
      }

      if (isEmpty) continue;

      const strVal = String(value).trim();

      if (field.type === 'number') {
        const num = Number(strVal.replace(/,/g, ''));
        if (isNaN(num)) {
          errors.push({
            field: field.field,
            messageAr: `الحقل "${field.labelAr}" يجب أن يكون رقماً`,
            messageEn: `Field "${field.labelEn}" must be a number`,
            stage: 'format',
            suggestion: `القيمة: "${strVal}". أزل الأحرف غير الرقمية`,
          });
        }
      }

      if (field.type === 'email' && strVal) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strVal)) {
          errors.push({
            field: field.field,
            messageAr: `البريد الإلكتروني "${strVal}" غير صالح`,
            messageEn: `Email "${strVal}" is invalid`,
            stage: 'format',
          });
        }
      }

      if (field.type === 'string' && strVal.length > 500) {
        errors.push({
          field: field.field,
          messageAr: `الحقل "${field.labelAr}" طويل جداً (${strVal.length})`,
          messageEn: `Field "${field.labelEn}" too long (${strVal.length})`,
          stage: 'format',
        });
      }
    }

    return errors;
  }
}
