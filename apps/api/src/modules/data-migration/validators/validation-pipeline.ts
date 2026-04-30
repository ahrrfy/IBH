import { Injectable } from '@nestjs/common';
import { FormatValidator, type ValidationError } from './format.validator';
import { BusinessRuleValidator } from './business-rule.validator';
import { ReferentialIntegrityValidator } from './referential-integrity.validator';
import { ArabicTextTransformer } from '../transformers/arabic-text.transformer';
import { DateTransformer, type DateFormat } from '../transformers/date.transformer';
import { PhoneTransformer } from '../transformers/phone.transformer';
import { ENTITY_FIELD_REGISTRY } from '../mappers/entity-field-registry';
import type { ImportableEntityType } from '../dto/data-migration.dto';

export interface RowValidationResult {
  status: 'valid' | 'warning' | 'error';
  transformedData: Record<string, unknown>;
  errors: ValidationError[];
  warnings: ValidationError[];
  resolvedIds: Record<string, string>;
}

@Injectable()
export class ValidationPipeline {
  constructor(
    private readonly formatValidator: FormatValidator,
    private readonly businessRuleValidator: BusinessRuleValidator,
    private readonly referentialValidator: ReferentialIntegrityValidator,
    private readonly arabicTransformer: ArabicTextTransformer,
    private readonly dateTransformer: DateTransformer,
    private readonly phoneTransformer: PhoneTransformer,
  ) {}

  async validateRow(
    sourceRow: Record<string, unknown>,
    mapping: Record<string, string>,
    entityType: ImportableEntityType,
    companyId: string,
    dateFormat: DateFormat = 'auto',
  ): Promise<RowValidationResult> {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationError[] = [];

    // Stage 1: Apply mapping
    const mapped = this.applyMapping(sourceRow, mapping);

    // Stage 2: Format validation
    const formatErrors = this.formatValidator.validate(mapped, entityType);
    if (formatErrors.length > 0) {
      return { status: 'error', transformedData: mapped, errors: formatErrors, warnings: [], resolvedIds: {} };
    }

    // Stage 3: Transform
    const transformed = this.applyTransformations(mapped, entityType, dateFormat);

    // Stage 4: Business rules
    const { errors: bizErrors, warnings: bizWarnings } = this.businessRuleValidator.validate(transformed, entityType);
    allErrors.push(...bizErrors);
    allWarnings.push(...bizWarnings);
    if (allErrors.length > 0) {
      return { status: 'error', transformedData: transformed, errors: allErrors, warnings: allWarnings, resolvedIds: {} };
    }

    // Stage 5: Referential integrity
    const { errors: refErrors, resolvedIds } = await this.referentialValidator.validate(
      transformed,
      entityType,
      companyId,
    );
    allErrors.push(...refErrors);

    const status = allErrors.length > 0 ? 'error' : allWarnings.length > 0 ? 'warning' : 'valid';
    return { status, transformedData: transformed, errors: allErrors, warnings: allWarnings, resolvedIds };
  }

  private applyMapping(
    sourceRow: Record<string, unknown>,
    mapping: Record<string, string>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [sourceCol, targetField] of Object.entries(mapping)) {
      if (targetField && sourceRow[sourceCol] !== undefined) {
        result[targetField] = sourceRow[sourceCol];
      }
    }
    return result;
  }

  private applyTransformations(
    row: Record<string, unknown>,
    entityType: ImportableEntityType,
    dateFormat: DateFormat,
  ): Record<string, unknown> {
    const fields = ENTITY_FIELD_REGISTRY[entityType];
    if (!fields) return row;

    const result = { ...row };

    for (const field of fields) {
      const val = result[field.field];
      if (val === null || val === undefined) continue;

      switch (field.type) {
        case 'string':
          result[field.field] = this.arabicTransformer.transform(String(val));
          break;
        case 'number': {
          const cleaned = String(val).replace(/,/g, '').trim();
          result[field.field] = Number(cleaned) || 0;
          break;
        }
        case 'boolean':
          result[field.field] = this.parseBoolean(val);
          break;
        case 'date':
          result[field.field] = this.dateTransformer.transform(val, dateFormat);
          break;
        case 'phone':
          result[field.field] = this.phoneTransformer.transform(val);
          break;
        case 'email':
          result[field.field] = String(val).trim().toLowerCase();
          break;
      }
    }

    return result;
  }

  private parseBoolean(val: unknown): boolean {
    if (typeof val === 'boolean') return val;
    const s = String(val).trim().toLowerCase();
    return ['true', '1', 'yes', 'نعم', 'صح'].includes(s);
  }
}
