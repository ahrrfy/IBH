import {
  recencyScore,
  frequencyScore,
  monetaryScore,
  assignSegment,
  computeRfm,
} from './rfm.thresholds';

/**
 * T44 — Unit tests for RFM bucket assignment.
 *
 * These thresholds drive a business-visible segment label, so the explicit
 * boundaries here ARE the spec — any change must update both code and tests.
 */
describe('RFM thresholds (T44)', () => {
  describe('recencyScore — days since last posted invoice', () => {
    it('returns 5 for very recent purchases (≤30 days)', () => {
      expect(recencyScore(0)).toBe(5);
      expect(recencyScore(30)).toBe(5);
    });
    it('returns 4 for 31..60 days', () => {
      expect(recencyScore(31)).toBe(4);
      expect(recencyScore(60)).toBe(4);
    });
    it('returns 3 for 61..120 days', () => {
      expect(recencyScore(120)).toBe(3);
    });
    it('returns 2 for 121..240 days', () => {
      expect(recencyScore(240)).toBe(2);
    });
    it('returns 1 for >240 days or null/negative', () => {
      expect(recencyScore(241)).toBe(1);
      expect(recencyScore(9999)).toBe(1);
      expect(recencyScore(null)).toBe(1);
      expect(recencyScore(undefined)).toBe(1);
      expect(recencyScore(-5)).toBe(1);
    });
  });

  describe('frequencyScore — invoice count in 365-day window', () => {
    it('returns 5 for ≥24 invoices/year', () => {
      expect(frequencyScore(24)).toBe(5);
      expect(frequencyScore(100)).toBe(5);
    });
    it('returns 4 for 12..23', () => {
      expect(frequencyScore(12)).toBe(4);
      expect(frequencyScore(23)).toBe(4);
    });
    it('returns 3 for 6..11', () => {
      expect(frequencyScore(6)).toBe(3);
    });
    it('returns 2 for 2..5', () => {
      expect(frequencyScore(2)).toBe(2);
    });
    it('returns 1 for 0 or 1', () => {
      expect(frequencyScore(0)).toBe(1);
      expect(frequencyScore(1)).toBe(1);
      expect(frequencyScore(null)).toBe(1);
    });
  });

  describe('monetaryScore — IQD total in window', () => {
    it('returns 5 for ≥50M IQD', () => {
      expect(monetaryScore(50_000_000)).toBe(5);
      expect(monetaryScore(200_000_000)).toBe(5);
    });
    it('returns 4 for 20M..50M', () => {
      expect(monetaryScore(20_000_000)).toBe(4);
    });
    it('returns 3 for 5M..20M', () => {
      expect(monetaryScore(5_000_000)).toBe(3);
    });
    it('returns 2 for 1M..5M', () => {
      expect(monetaryScore(1_000_000)).toBe(2);
    });
    it('returns 1 for <1M or null', () => {
      expect(monetaryScore(999_999)).toBe(1);
      expect(monetaryScore(0)).toBe(1);
      expect(monetaryScore(null)).toBe(1);
    });
  });

  describe('assignSegment', () => {
    it('Champion: top buyer (R5 F5 M5)', () => {
      expect(assignSegment(5, 5, 5, true)).toBe('Champion');
      expect(assignSegment(4, 4, 4, true)).toBe('Champion');
    });
    it('Loyal: frequent buyer (F≥4) and not stale', () => {
      expect(assignSegment(3, 4, 3, true)).toBe('Loyal');
      expect(assignSegment(5, 4, 2, true)).toBe('Loyal');
    });
    it('At-Risk: stale recency but used to be active', () => {
      expect(assignSegment(2, 4, 4, true)).toBe('At-Risk');
      expect(assignSegment(1, 3, 2, true)).toBe('At-Risk');
      expect(assignSegment(2, 1, 4, true)).toBe('At-Risk');
    });
    it('Lost: no recent activity AND low frequency', () => {
      expect(assignSegment(1, 1, 1, true)).toBe('Lost');
      expect(assignSegment(1, 0, 5, true)).toBe('Lost');
    });
    it('New: recent first-time buyer', () => {
      expect(assignSegment(5, 1, 1, true)).toBe('New');
      expect(assignSegment(4, 0, 1, true)).toBe('New');
    });
    it('No invoices ever → New', () => {
      expect(assignSegment(1, 1, 1, false)).toBe('New');
      expect(assignSegment(5, 5, 5, false)).toBe('New');
    });
  });

  describe('computeRfm — end-to-end', () => {
    it('returns Champion for a top customer', () => {
      const r = computeRfm({ recencyDays: 10, frequency: 30, monetaryIqd: 100_000_000 });
      expect(r).toEqual({ rScore: 5, fScore: 5, mScore: 5, segment: 'Champion' });
    });
    it('returns Loyal for a steady mid-tier buyer', () => {
      const r = computeRfm({ recencyDays: 90, frequency: 14, monetaryIqd: 8_000_000 });
      expect(r.segment).toBe('Loyal');
    });
    it('returns At-Risk for a once-active gone-quiet buyer', () => {
      const r = computeRfm({ recencyDays: 200, frequency: 8, monetaryIqd: 6_000_000 });
      expect(r.segment).toBe('At-Risk');
    });
    it('returns Lost for ancient single-purchase buyer', () => {
      const r = computeRfm({ recencyDays: 800, frequency: 1, monetaryIqd: 500_000 });
      expect(r.segment).toBe('Lost');
    });
    it('returns New for never-bought customer', () => {
      const r = computeRfm({ recencyDays: null, frequency: 0, monetaryIqd: 0 });
      expect(r.segment).toBe('New');
    });
    it('returns New for a first-time recent buyer', () => {
      const r = computeRfm({ recencyDays: 5, frequency: 1, monetaryIqd: 300_000 });
      expect(r.segment).toBe('New');
    });
  });
});
