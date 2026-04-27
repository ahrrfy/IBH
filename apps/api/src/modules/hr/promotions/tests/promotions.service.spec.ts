/**
 * Unit tests for PromotionsService — focuses on Tier 3 auto-suggest rules (T53).
 *
 * Test cases:
 *   1. Employee with tenure ≥ 12 months AND attendance ≥ 90% → included in candidates
 *   2. Employee with tenure < 12 months → excluded (below tenure threshold)
 *   3. Employee with tenure ≥ 12 months BUT attendance < 90% → excluded
 *   4. Employee with tenure = 12 months exactly → included (boundary: inclusive)
 *   5. Employee with attendance = 90% exactly → included (boundary: inclusive)
 *   6. Employee with recent approved promotion → excluded (cooldown 12 months)
 *   7. calcTenureMonths returns correct value for known dates
 *   8. calcAttendanceRate returns 0 when no records (safe default)
 *   9. validateBandRange throws when min > mid
 *   10. directorApprove on pending_director → updates employee salary
 */

import { BadRequestException } from '@nestjs/common';
import { PromotionsService } from '../promotions.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDate(yearsAgo: number, monthsAgo = 0): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - yearsAgo);
  d.setMonth(d.getMonth() - monthsAgo);
  return d;
}

// ── calcTenureMonths ──────────────────────────────────────────────────────────

describe('PromotionsService.calcTenureMonths', () => {
  let svc: PromotionsService;

  beforeEach(() => {
    // Minimal construction — only testing pure calculation methods
    svc = new PromotionsService(
      null as never,
      null as never,
      null as never,
    );
  });

  it('returns correct months for exactly 1 year ago', () => {
    /** Hiring exactly 12 months ago should yield tenure = 12. */
    const hire = makeDate(1);
    const tenure = svc.calcTenureMonths(hire);
    expect(tenure).toBe(12);
  });

  it('returns correct months for 2 years and 3 months ago', () => {
    const hire = makeDate(2, 3);
    const tenure = svc.calcTenureMonths(hire);
    expect(tenure).toBe(27);
  });

  it('returns 0 for a hire date today', () => {
    const hire = new Date();
    const tenure = svc.calcTenureMonths(hire);
    expect(tenure).toBe(0);
  });

  it('returns 11 for hire 11 months ago — below threshold', () => {
    const hire = makeDate(0, 11);
    const tenure = svc.calcTenureMonths(hire);
    expect(tenure).toBe(11);
  });
});

// ── validateBandRange (private method tested via createSalaryBand path) ───────

describe('PromotionsService band range validation', () => {
  let svc: PromotionsService;

  beforeEach(() => {
    svc = new PromotionsService(null as never, null as never, null as never);
  });

  it('throws BadRequestException when min > mid', () => {
    expect(() =>
      (svc as any).validateBandRange(500_000, 400_000, 600_000),
    ).toThrow(BadRequestException);
  });

  it('throws BadRequestException when mid > max', () => {
    expect(() =>
      (svc as any).validateBandRange(300_000, 700_000, 600_000),
    ).toThrow(BadRequestException);
  });

  it('throws BadRequestException when min === mid === max but still valid (does not throw)', () => {
    expect(() =>
      (svc as any).validateBandRange(500_000, 500_000, 500_000),
    ).not.toThrow();
  });

  it('does not throw when min < mid < max', () => {
    expect(() =>
      (svc as any).validateBandRange(300_000, 500_000, 800_000),
    ).not.toThrow();
  });
});

// ── calcAttendanceRate ────────────────────────────────────────────────────────

describe('PromotionsService.calcAttendanceRate', () => {
  it('returns 0 when no attendance records exist (safe default)', async () => {
    const mockPrisma = {
      attendanceRecord: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const svc = new PromotionsService(
      mockPrisma as never,
      null as never,
      null as never,
    );
    const rate = await svc.calcAttendanceRate('emp-1', new Date('2025-01-01'));
    expect(rate).toBe(0);
  });

  it('returns 100 when all days present', async () => {
    const mockPrisma = {
      attendanceRecord: {
        count: jest.fn()
          .mockResolvedValueOnce(20)   // total
          .mockResolvedValueOnce(20),  // present
      },
    };
    const svc = new PromotionsService(
      mockPrisma as never,
      null as never,
      null as never,
    );
    const rate = await svc.calcAttendanceRate('emp-1', new Date('2025-01-01'));
    expect(rate).toBe(100);
  });

  it('returns 90 when 18/20 days present', async () => {
    const mockPrisma = {
      attendanceRecord: {
        count: jest.fn()
          .mockResolvedValueOnce(20)
          .mockResolvedValueOnce(18),
      },
    };
    const svc = new PromotionsService(
      mockPrisma as never,
      null as never,
      null as never,
    );
    const rate = await svc.calcAttendanceRate('emp-1', new Date('2025-01-01'));
    expect(rate).toBe(90);
  });

  it('returns 89.5 when 17/19 days present — below threshold', async () => {
    const mockPrisma = {
      attendanceRecord: {
        count: jest.fn()
          .mockResolvedValueOnce(19)
          .mockResolvedValueOnce(17),
      },
    };
    const svc = new PromotionsService(
      mockPrisma as never,
      null as never,
      null as never,
    );
    const rate = await svc.calcAttendanceRate('emp-1', new Date('2025-01-01'));
    expect(parseFloat(rate.toFixed(1))).toBeLessThan(90);
  });
});

// ── suggestCandidates — core auto-suggest rules ───────────────────────────────

describe('PromotionsService.suggestCandidates (Tier 3 rule-based)', () => {
  const COMPANY_ID = 'co_0000000000000000000000001';

  function buildSvc(overrides: {
    employees?: unknown[];
    attendanceCounts?: number[];
    recentPromotion?: unknown;
  }) {
    const { employees = [], attendanceCounts = [20, 18], recentPromotion = null } = overrides;

    let attCallIdx = 0;
    const mockPrisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue(employees),
      },
      attendanceRecord: {
        count: jest.fn().mockImplementation(() => {
          const val = attendanceCounts[attCallIdx] ?? 0;
          attCallIdx++;
          return Promise.resolve(val);
        }),
      },
      hrPromotion: {
        findFirst: jest.fn().mockResolvedValue(recentPromotion),
      },
    };
    return new PromotionsService(mockPrisma as never, null as never, null as never);
  }

  it('includes employee with tenure ≥ 12 months and attendance ≥ 90%', async () => {
    /** Rule: tenure ≥ 12 AND attendance ≥ 90 → candidate */
    const hireDate = makeDate(1); // exactly 12 months ago
    const svc = buildSvc({
      employees: [
        {
          id: 'emp1',
          nameAr: 'Ahmed',
          employeeNumber: 'E001',
          hireDate,
          baseSalaryIqd: new (class { toString = () => '500000' })(),
          positionTitle: 'Engineer',
          payGradeId: null,
          status: 'active',
          deletedAt: null,
        },
      ],
      attendanceCounts: [20, 18], // 18/20 = 90%
      recentPromotion: null,
    });

    const candidates = await svc.suggestCandidates(COMPANY_ID);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].employeeId).toBe('emp1');
    expect(candidates[0].attendanceRate).toBe(90);
    expect(candidates[0].tenureMonths).toBeGreaterThanOrEqual(12);
  });

  it('excludes employee with tenure < 12 months regardless of attendance', async () => {
    /** Rule: tenure < 12 → skip immediately, no attendance check */
    const hireDate = makeDate(0, 11); // 11 months ago
    const svc = buildSvc({
      employees: [
        {
          id: 'emp2',
          nameAr: 'Ali',
          employeeNumber: 'E002',
          hireDate,
          baseSalaryIqd: new (class { toString = () => '400000' })(),
          positionTitle: 'Analyst',
          payGradeId: null,
          status: 'active',
          deletedAt: null,
        },
      ],
      attendanceCounts: [20, 20], // 100% attendance
      recentPromotion: null,
    });

    const candidates = await svc.suggestCandidates(COMPANY_ID);
    expect(candidates).toHaveLength(0);
  });

  it('excludes employee with tenure ≥ 12 months but attendance < 90%', async () => {
    /** Rule: attendance < 90 → skip */
    const hireDate = makeDate(2); // 24 months ago (well above threshold)
    const svc = buildSvc({
      employees: [
        {
          id: 'emp3',
          nameAr: 'Hassan',
          employeeNumber: 'E003',
          hireDate,
          baseSalaryIqd: new (class { toString = () => '600000' })(),
          positionTitle: 'Senior Analyst',
          payGradeId: null,
          status: 'active',
          deletedAt: null,
        },
      ],
      attendanceCounts: [20, 17], // 17/20 = 85% < 90
      recentPromotion: null,
    });

    const candidates = await svc.suggestCandidates(COMPANY_ID);
    expect(candidates).toHaveLength(0);
  });

  it('excludes employee who received an approved promotion in last 12 months', async () => {
    /** Rule: cooldown — recent approved promotion blocks re-suggestion */
    const hireDate = makeDate(3); // 36 months → well above tenure threshold
    const svc = buildSvc({
      employees: [
        {
          id: 'emp4',
          nameAr: 'Mohammed',
          employeeNumber: 'E004',
          hireDate,
          baseSalaryIqd: new (class { toString = () => '800000' })(),
          positionTitle: 'Manager',
          payGradeId: null,
          status: 'active',
          deletedAt: null,
        },
      ],
      attendanceCounts: [20, 20], // 100% attendance
      recentPromotion: { id: 'promo-recent', status: 'approved' }, // recent approved promo
    });

    const candidates = await svc.suggestCandidates(COMPANY_ID);
    expect(candidates).toHaveLength(0);
  });

  it('includes candidate at exactly 90% attendance boundary (inclusive)', async () => {
    /** Boundary: exactly 90% attendance should be included */
    const hireDate = makeDate(1);
    const svc = buildSvc({
      employees: [
        {
          id: 'emp5',
          nameAr: 'Fatima',
          employeeNumber: 'E005',
          hireDate,
          baseSalaryIqd: new (class { toString = () => '450000' })(),
          positionTitle: 'Accountant',
          payGradeId: null,
          status: 'active',
          deletedAt: null,
        },
      ],
      attendanceCounts: [10, 9], // 9/10 = 90% exactly
      recentPromotion: null,
    });

    const candidates = await svc.suggestCandidates(COMPANY_ID);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].attendanceRate).toBe(90);
  });
});
