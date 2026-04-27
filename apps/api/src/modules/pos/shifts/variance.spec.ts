import { computeBlindVariance, IQD_DENOMINATIONS } from './shifts.service';

/**
 * Unit tests for the pure blind-cash-count variance calculator.
 *
 * The math invariant under test:
 *   expected   = opening + cashReceipts − cashRefunds + cashIn − cashOut
 *   counted    = Σ (denom × count)
 *   variance   = counted − expected
 *
 *   variance > 0           → over   (drawer has more)
 *   variance < 0           → short  (drawer is missing money)
 *   |variance| > tolerance → requires manager approval
 */
describe('computeBlindVariance — POS blind cash count math', () => {
  const baseFlow = {
    openingCashIqd: 100_000,
    cashReceipts: 250_000,
    cashRefunds: 10_000,
    cashInMovements: 0,
    cashOutMovements: 20_000,
    toleranceIqd: 5_000,
  };
  // expected = 100,000 + 250,000 − 10,000 + 0 − 20,000 = 320,000

  it('exact match: counted equals expected → variance 0, no approval', () => {
    // 320,000 IQD = 6×50k + 1×10k + 2×5k → 300k + 10k + 10k = 320k
    const r = computeBlindVariance({
      ...baseFlow,
      countedDenominations: [
        { denom: 50000, count: 6 },
        { denom: 10000, count: 1 },
        { denom: 5000, count: 2 },
      ],
    });
    expect(r.expectedCashIqd).toBe('320000');
    expect(r.countedCashIqd).toBe('320000');
    expect(r.varianceIqd).toBe('0');
    expect(r.isExact).toBe(true);
    expect(r.isShort).toBe(false);
    expect(r.isOver).toBe(false);
    expect(r.exceedsTolerance).toBe(false);
    expect(r.requiresManagerApproval).toBe(false);
  });

  it('positive variance (over) within tolerance → no manager approval', () => {
    // counted = 322,000 → variance = +2,000 (≤ 5,000 tolerance)
    const r = computeBlindVariance({
      ...baseFlow,
      countedDenominations: [
        { denom: 50000, count: 6 },
        { denom: 10000, count: 2 },
        { denom: 1000, count: 2 },
      ],
    });
    expect(r.countedCashIqd).toBe('322000');
    expect(r.varianceIqd).toBe('2000');
    expect(r.isOver).toBe(true);
    expect(r.isShort).toBe(false);
    expect(r.exceedsTolerance).toBe(false);
    expect(r.requiresManagerApproval).toBe(false);
  });

  it('negative variance (short) exceeding tolerance → manager approval required', () => {
    // counted = 310,000 → variance = −10,000 (> 5,000 abs tolerance)
    const r = computeBlindVariance({
      ...baseFlow,
      countedDenominations: [
        { denom: 50000, count: 6 },
        { denom: 10000, count: 1 },
      ],
    });
    expect(r.countedCashIqd).toBe('310000');
    expect(r.varianceIqd).toBe('-10000');
    expect(r.isShort).toBe(true);
    expect(r.isOver).toBe(false);
    expect(r.exceedsTolerance).toBe(true);
    expect(r.requiresManagerApproval).toBe(true);
  });

  it('positive variance (over) exceeding tolerance → manager approval required', () => {
    // counted = 350,000 → variance = +30,000 (> 5,000 tolerance)
    const r = computeBlindVariance({
      ...baseFlow,
      countedDenominations: [
        { denom: 50000, count: 7 },
      ],
    });
    expect(r.countedCashIqd).toBe('350000');
    expect(r.varianceIqd).toBe('30000');
    expect(r.isOver).toBe(true);
    expect(r.exceedsTolerance).toBe(true);
    expect(r.requiresManagerApproval).toBe(true);
  });

  it('multi-denomination tally sums correctly across all 7 IQD denominations', () => {
    // 1×250 + 2×500 + 3×1000 + 4×5000 + 5×10000 + 6×25000 + 7×50000
    //   = 250 + 1000 + 3000 + 20000 + 50000 + 150000 + 350000 = 574,250
    const r = computeBlindVariance({
      openingCashIqd: 0,
      cashReceipts: 574_250,
      cashRefunds: 0,
      cashInMovements: 0,
      cashOutMovements: 0,
      toleranceIqd: 1_000,
      countedDenominations: [
        { denom: 250, count: 1 },
        { denom: 500, count: 2 },
        { denom: 1000, count: 3 },
        { denom: 5000, count: 4 },
        { denom: 10000, count: 5 },
        { denom: 25000, count: 6 },
        { denom: 50000, count: 7 },
      ],
    });
    expect(r.countedCashIqd).toBe('574250');
    expect(r.expectedCashIqd).toBe('574250');
    expect(r.isExact).toBe(true);
  });

  it('empty drawer (all zero counts) handled cleanly', () => {
    const r = computeBlindVariance({
      openingCashIqd: 0,
      cashReceipts: 0,
      cashRefunds: 0,
      cashInMovements: 0,
      cashOutMovements: 0,
      toleranceIqd: 5_000,
      countedDenominations: IQD_DENOMINATIONS.map((d) => ({ denom: d, count: 0 })),
    });
    expect(r.countedCashIqd).toBe('0');
    expect(r.expectedCashIqd).toBe('0');
    expect(r.varianceIqd).toBe('0');
    expect(r.isExact).toBe(true);
    expect(r.requiresManagerApproval).toBe(false);
  });

  it('cash withdrawals (interim pickup) reduce expected total correctly', () => {
    // opening 50k + receipts 200k − pickup 100k = 150k expected.
    // cashier counts 150k → exact.
    const r = computeBlindVariance({
      openingCashIqd: 50_000,
      cashReceipts: 200_000,
      cashRefunds: 0,
      cashInMovements: 0,
      cashOutMovements: 100_000,
      toleranceIqd: 5_000,
      countedDenominations: [
        { denom: 50000, count: 3 },
      ],
    });
    expect(r.expectedCashIqd).toBe('150000');
    expect(r.countedCashIqd).toBe('150000');
    expect(r.isExact).toBe(true);
  });

  it('boundary: variance exactly equal to tolerance does NOT require approval', () => {
    // tolerance 5,000 — variance of exactly 5,000 IQD is allowed without approval.
    const r = computeBlindVariance({
      ...baseFlow,
      countedDenominations: [
        { denom: 50000, count: 6 },
        { denom: 10000, count: 2 },
        { denom: 5000, count: 1 },
      ],
    });
    // counted 325,000 - expected 320,000 = +5,000 exactly
    expect(r.varianceIqd).toBe('5000');
    expect(r.exceedsTolerance).toBe(false);
    expect(r.requiresManagerApproval).toBe(false);
  });
});
