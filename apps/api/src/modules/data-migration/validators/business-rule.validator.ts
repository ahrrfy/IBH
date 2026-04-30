import { Injectable } from '@nestjs/common';
import type { ImportableEntityType } from '../dto/data-migration.dto';
import type { ValidationError } from './format.validator';

@Injectable()
export class BusinessRuleValidator {
  validate(
    row: Record<string, unknown>,
    entityType: ImportableEntityType,
  ): { errors: ValidationError[]; warnings: ValidationError[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    for (const rule of this.getRules(entityType)) {
      const result = rule(row);
      if (result) {
        if (result.severity === 'error') errors.push(result.error);
        else warnings.push(result.error);
      }
    }

    return { errors, warnings };
  }

  private getRules(
    entityType: ImportableEntityType,
  ): Array<(row: Record<string, unknown>) => { error: ValidationError; severity: 'error' | 'warning' } | null> {
    const rules: Array<(row: Record<string, unknown>) => { error: ValidationError; severity: 'error' | 'warning' } | null> = [];

    switch (entityType) {
      case 'product_template':
        rules.push((row) => {
          const sale = Number(row['salePrice']) || 0;
          const min = Number(row['minSalePrice']) || 0;
          if (min > 0 && sale > 0 && min > sale) {
            return {
              severity: 'error',
              error: { field: 'minSalePrice', messageAr: 'أدنى سعر بيع أكبر من سعر البيع', messageEn: 'Min sale price exceeds sale price', stage: 'business' },
            };
          }
          return null;
        });
        rules.push((row) => {
          const cost = Number(row['costPrice']) || 0;
          const sale = Number(row['salePrice']) || 0;
          if (cost > 0 && sale > 0 && cost > sale) {
            return {
              severity: 'warning',
              error: { field: 'costPrice', messageAr: 'سعر التكلفة أعلى من سعر البيع', messageEn: 'Cost price exceeds sale price', stage: 'business' },
            };
          }
          return null;
        });
        break;

      case 'customer':
        rules.push((row) => {
          const credit = Number(row['creditLimitIqd']) || 0;
          if (credit < 0) {
            return {
              severity: 'error',
              error: { field: 'creditLimitIqd', messageAr: 'حد الائتمان لا يمكن أن يكون سالباً', messageEn: 'Credit limit cannot be negative', stage: 'business' },
            };
          }
          return null;
        });
        break;

      case 'employee':
        rules.push((row) => {
          if (row['hireDate'] instanceof Date && row['hireDate'] > new Date()) {
            return {
              severity: 'warning',
              error: { field: 'hireDate', messageAr: 'تاريخ التعيين في المستقبل', messageEn: 'Hire date in the future', stage: 'business' },
            };
          }
          return null;
        });
        rules.push((row) => {
          const salary = Number(row['baseSalaryIqd']) || 0;
          if (salary < 0) {
            return {
              severity: 'error',
              error: { field: 'baseSalaryIqd', messageAr: 'الراتب لا يمكن أن يكون سالباً', messageEn: 'Salary cannot be negative', stage: 'business' },
            };
          }
          return null;
        });
        break;

      case 'opening_balance':
        rules.push((row) => {
          const debit = Number(row['debit']) || 0;
          const credit = Number(row['credit']) || 0;
          if (debit > 0 && credit > 0) {
            return {
              severity: 'error',
              error: { field: 'debit', messageAr: 'لا يمكن أن يكون السطر مديناً ودائناً معاً', messageEn: 'Row cannot have both debit and credit', stage: 'business' },
            };
          }
          if (debit === 0 && credit === 0) {
            return {
              severity: 'error',
              error: { field: 'debit', messageAr: 'يجب إدخال مبلغ مدين أو دائن', messageEn: 'Must have either debit or credit', stage: 'business' },
            };
          }
          return null;
        });
        break;

      case 'opening_stock':
        rules.push((row) => {
          const qty = Number(row['qty']) || 0;
          if (qty <= 0) {
            return {
              severity: 'error',
              error: { field: 'qty', messageAr: 'الكمية يجب أن تكون أكبر من صفر', messageEn: 'Quantity must be positive', stage: 'business' },
            };
          }
          return null;
        });
        rules.push((row) => {
          const cost = Number(row['unitCostIqd']) || 0;
          if (cost <= 0) {
            return {
              severity: 'error',
              error: { field: 'unitCostIqd', messageAr: 'تكلفة الوحدة يجب أن تكون أكبر من صفر', messageEn: 'Unit cost must be positive', stage: 'business' },
            };
          }
          return null;
        });
        break;

      case 'price_list':
        rules.push((row) => {
          const price = Number(row['price']) || 0;
          if (price < 0) {
            return {
              severity: 'error',
              error: { field: 'price', messageAr: 'السعر لا يمكن أن يكون سالباً', messageEn: 'Price cannot be negative', stage: 'business' },
            };
          }
          return null;
        });
        break;
    }

    return rules;
  }
}
