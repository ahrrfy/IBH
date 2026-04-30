import { FormatValidator } from '../validators/format.validator';

describe('FormatValidator', () => {
  const validator = new FormatValidator();

  it('flags missing required fields', () => {
    const errors = validator.validate({}, 'product_template');
    expect(errors.length).toBeGreaterThan(0);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain('sku');
    expect(fields).toContain('nameAr');
  });

  it('accepts a fully-populated template row', () => {
    const errors = validator.validate(
      {
        sku: 'SAM-A54',
        nameAr: 'هاتف',
        categoryNameAr: 'إلكترونيات',
        uomAbbreviation: 'PCS',
        defaultSalePriceIqd: '500000',
        defaultPurchasePriceIqd: '400000',
        minSalePriceIqd: '450000',
      },
      'product_template',
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects non-numeric values for number fields', () => {
    const errors = validator.validate(
      { sku: 'X', nameAr: 'Y', categoryNameAr: 'C', uomAbbreviation: 'P',
        defaultSalePriceIqd: 'not-a-number', defaultPurchasePriceIqd: '100', minSalePriceIqd: '90' },
      'product_template',
    );
    expect(errors.some((e) => e.field === 'defaultSalePriceIqd')).toBe(true);
  });

  it('accepts numbers with thousand separators', () => {
    const errors = validator.validate(
      { sku: 'X', nameAr: 'Y', categoryNameAr: 'C', uomAbbreviation: 'P',
        defaultSalePriceIqd: '500,000', defaultPurchasePriceIqd: '400,000', minSalePriceIqd: '450,000' },
      'product_template',
    );
    expect(errors.filter((e) => e.stage === 'format' && e.field.includes('Price'))).toHaveLength(0);
  });

  it('rejects malformed emails', () => {
    const errors = validator.validate(
      { code: 'C1', nameAr: 'X', email: 'not-an-email' },
      'customer',
    );
    expect(errors.some((e) => e.field === 'email')).toBe(true);
  });

  it('accepts well-formed emails', () => {
    const errors = validator.validate(
      { code: 'C1', nameAr: 'X', email: 'user@example.com' },
      'customer',
    );
    expect(errors.some((e) => e.field === 'email')).toBe(false);
  });

  it('returns bilingual error messages with fix suggestions', () => {
    const errors = validator.validate({}, 'product_template');
    const skuErr = errors.find((e) => e.field === 'sku');
    expect(skuErr?.messageAr).toBeTruthy();
    expect(skuErr?.messageEn).toBeTruthy();
    expect(skuErr?.suggestion).toBeTruthy();
    expect(skuErr?.stage).toBe('format');
  });
});
