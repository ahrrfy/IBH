import { BusinessRuleValidator } from '../validators/business-rule.validator';

describe('BusinessRuleValidator', () => {
  const v = new BusinessRuleValidator();

  describe('opening_balance — F2 double-entry sanity', () => {
    it('rejects rows with both debit and credit non-zero', () => {
      const { errors } = v.validate({ debit: 1000, credit: 500 }, 'opening_balance');
      expect(errors.some((e) => e.field === 'debit')).toBe(true);
    });

    it('rejects rows with neither debit nor credit', () => {
      const { errors } = v.validate({ debit: 0, credit: 0 }, 'opening_balance');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('accepts pure debit', () => {
      const { errors } = v.validate({ debit: 5000000, credit: 0 }, 'opening_balance');
      expect(errors).toHaveLength(0);
    });

    it('accepts pure credit', () => {
      const { errors } = v.validate({ debit: 0, credit: 5000000 }, 'opening_balance');
      expect(errors).toHaveLength(0);
    });
  });

  describe('opening_stock — F3 stock sanity', () => {
    it('rejects zero or negative quantity', () => {
      const { errors } = v.validate({ qty: 0, unitCostIqd: 100 }, 'opening_stock');
      expect(errors.some((e) => e.field === 'qty')).toBe(true);
    });

    it('rejects zero or negative unit cost', () => {
      const { errors } = v.validate({ qty: 10, unitCostIqd: 0 }, 'opening_stock');
      expect(errors.some((e) => e.field === 'unitCostIqd')).toBe(true);
    });

    it('accepts positive qty + cost', () => {
      const { errors } = v.validate({ qty: 100, unitCostIqd: 400000 }, 'opening_stock');
      expect(errors).toHaveLength(0);
    });
  });

  describe('product_template price hierarchy', () => {
    it('rejects min sale price greater than sale price', () => {
      const { errors } = v.validate(
        { salePrice: 100, minSalePrice: 150 },
        'product_template',
      );
      expect(errors.some((e) => e.field === 'minSalePrice')).toBe(true);
    });

    it('warns when cost is greater than sale (loss-leading product)', () => {
      const { errors, warnings } = v.validate(
        { salePrice: 100, costPrice: 150 },
        'product_template',
      );
      expect(errors.filter((e) => e.field === 'costPrice')).toHaveLength(0);
      expect(warnings.some((w) => w.field === 'costPrice')).toBe(true);
    });
  });

  describe('customer credit limit', () => {
    it('rejects negative credit limit', () => {
      const { errors } = v.validate({ creditLimitIqd: -1000 }, 'customer');
      expect(errors.some((e) => e.field === 'creditLimitIqd')).toBe(true);
    });
  });

  describe('employee', () => {
    it('warns when hire date is in future', () => {
      const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const { warnings } = v.validate({ hireDate: future }, 'employee');
      expect(warnings.some((w) => w.field === 'hireDate')).toBe(true);
    });

    it('rejects negative salary', () => {
      const { errors } = v.validate({ baseSalaryIqd: -100 }, 'employee');
      expect(errors.some((e) => e.field === 'baseSalaryIqd')).toBe(true);
    });
  });

  describe('price_list', () => {
    it('rejects negative price', () => {
      const { errors } = v.validate({ price: -100 }, 'price_list');
      expect(errors.some((e) => e.field === 'price')).toBe(true);
    });
  });
});
