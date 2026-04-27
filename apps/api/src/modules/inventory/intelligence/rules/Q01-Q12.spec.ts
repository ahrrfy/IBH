import {
  ALL_RULES,
  DEFAULT_RULE_CONTEXT,
  Q01_slowMoving,
  Q02_overstock,
  Q03_lowStock,
  Q05_negativeMargin,
  Q06_costSpike,
  Q07_negativeBalance,
  Q08_reservationBottleneck,
  Q09_inactiveWithStock,
  Q11_capitalLocked,
  Q12_velocitySpike,
  RULE_CATALOGUE,
  SkuSnapshot,
} from './Q01-Q12';

const baseSku = (overrides: Partial<SkuSnapshot> = {}): SkuSnapshot => ({
  variantId: 'V1',
  warehouseId: 'W1',
  companyId: 'C1',
  qtyOnHand: 100,
  qtyReserved: 0,
  avgCostIqd: 1000,
  reorderQty: null,
  leadTimeDays: 7,
  safetyStock: 0,
  sellingPriceIqd: 2000,
  salesQtyLast30: 0,
  salesQtyLast90: 90, // 1/day
  salesIqdLast90: 0,
  cogsIqdLast90: 0,
  lastMovementAt: new Date(),
  lastInboundCostIqd: 1000,
  earliestExpiryAt: null,
  daysToEarliestExpiry: null,
  templateNameAr: 'منتج تجريبي',
  templateType: 'product',
  isActive: true,
  ...overrides,
});

describe('T42 — Q01..Q12 rule engine', () => {
  it('catalogue covers all 12 rules', () => {
    expect(RULE_CATALOGUE).toHaveLength(12);
    expect(ALL_RULES).toHaveLength(12);
  });

  describe('Q01 — slow moving', () => {
    it('flags items with no sales for >= 60 days', () => {
      const sku = baseSku({
        salesQtyLast90: 0,
        lastMovementAt: new Date(Date.now() - 70 * 86_400_000),
      });
      const flag = Q01_slowMoving(sku, DEFAULT_RULE_CONTEXT);
      expect(flag).not.toBeNull();
      expect(flag?.severity).toBe('warning');
      expect(flag?.metric).toBeGreaterThanOrEqual(70);
    });
    it('does not flag healthy items', () => {
      expect(Q01_slowMoving(baseSku(), DEFAULT_RULE_CONTEXT)).toBeNull();
    });
  });

  describe('Q02 — overstock', () => {
    it('flags when days-of-cover greatly exceeds lead time × multiple', () => {
      const sku = baseSku({ qtyOnHand: 5000, salesQtyLast90: 90 }); // 5000d cover
      const flag = Q02_overstock(sku, DEFAULT_RULE_CONTEXT);
      expect(flag?.ruleCode).toBe('Q02');
    });
  });

  describe('Q03 — below reorder point', () => {
    it('flags critical when qty <= 0', () => {
      const sku = baseSku({ qtyOnHand: 0, reorderQty: 50 });
      const flag = Q03_lowStock(sku, DEFAULT_RULE_CONTEXT);
      expect(flag?.severity).toBe('critical');
    });
    it('flags warning when qty <= ROP', () => {
      const sku = baseSku({ qtyOnHand: 30, reorderQty: 50 });
      const flag = Q03_lowStock(sku, DEFAULT_RULE_CONTEXT);
      expect(flag?.severity).toBe('warning');
    });
    it('uses computed ROP when none configured', () => {
      // dailySales=1, lead=7 → ROP=7
      const sku = baseSku({ qtyOnHand: 5, reorderQty: null, leadTimeDays: 7, salesQtyLast90: 90 });
      const flag = Q03_lowStock(sku, DEFAULT_RULE_CONTEXT);
      expect(flag).not.toBeNull();
    });
    it('skips bundles and services', () => {
      const sku = baseSku({ templateType: 'service', qtyOnHand: 0, reorderQty: 50 });
      expect(Q03_lowStock(sku, DEFAULT_RULE_CONTEXT)).toBeNull();
    });
  });

  describe('Q05 — negative margin', () => {
    it('flags negative margin as critical', () => {
      const sku = baseSku({ avgCostIqd: 2500, sellingPriceIqd: 2000 });
      const flag = Q05_negativeMargin(sku, DEFAULT_RULE_CONTEXT);
      expect(flag?.severity).toBe('critical');
    });
    it('flags poor (positive) margin as warning', () => {
      const sku = baseSku({ avgCostIqd: 1990, sellingPriceIqd: 2000 }); // 0.5% margin
      const flag = Q05_negativeMargin(sku, DEFAULT_RULE_CONTEXT);
      expect(flag?.severity).toBe('warning');
    });
  });

  describe('Q06 — cost spike', () => {
    it('flags >25% spike vs MWA', () => {
      const sku = baseSku({ avgCostIqd: 1000, lastInboundCostIqd: 1300 });
      expect(Q06_costSpike(sku, DEFAULT_RULE_CONTEXT)).not.toBeNull();
    });
  });

  describe('Q07 — negative balance', () => {
    it('always flags critical (F3 invariant)', () => {
      const sku = baseSku({ qtyOnHand: -1 });
      const flag = Q07_negativeBalance(sku, DEFAULT_RULE_CONTEXT);
      expect(flag?.severity).toBe('critical');
    });
  });

  describe('Q08 — reservation bottleneck', () => {
    it('flags when >= 80% reserved', () => {
      const sku = baseSku({ qtyOnHand: 100, qtyReserved: 85 });
      expect(Q08_reservationBottleneck(sku, DEFAULT_RULE_CONTEXT)).not.toBeNull();
    });
  });

  describe('Q09 — inactive with stock', () => {
    it('flags inactive variants holding inventory', () => {
      const sku = baseSku({ isActive: false, qtyOnHand: 5 });
      expect(Q09_inactiveWithStock(sku, DEFAULT_RULE_CONTEXT)).not.toBeNull();
    });
  });

  describe('Q11 — capital locked', () => {
    it('flags 5M+ IQD locked with no recent sales', () => {
      const sku = baseSku({ qtyOnHand: 100, avgCostIqd: 60_000, salesQtyLast30: 0 });
      expect(Q11_capitalLocked(sku, DEFAULT_RULE_CONTEXT)).not.toBeNull();
    });
  });

  describe('Q12 — velocity spike', () => {
    it('flags 3x+ recent demand vs prior', () => {
      const sku = baseSku({ salesQtyLast30: 60, salesQtyLast90: 70 });
      // dailyRecent=2, dailyPrior= (10/60)=0.166 → ratio 12 ✓
      expect(Q12_velocitySpike(sku, DEFAULT_RULE_CONTEXT)).not.toBeNull();
    });
    it('does not flag steady demand', () => {
      const sku = baseSku({ salesQtyLast30: 30, salesQtyLast90: 90 });
      expect(Q12_velocitySpike(sku, DEFAULT_RULE_CONTEXT)).toBeNull();
    });
  });
});
