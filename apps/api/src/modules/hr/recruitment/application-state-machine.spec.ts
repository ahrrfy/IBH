/**
 * Unit tests for the HR Recruitment application state machine (T51).
 *
 * Verifies:
 *   - Happy path: new → screened → interview → offer → hired
 *   - Rejection branch from every non-terminal state
 *   - Terminal states cannot transition
 *   - Backwards transitions and same-state transitions are rejected
 *   - Auto-screen scorer behaves as documented
 */
import {
  ApplicationStatus,
  AUTO_SCREEN_THRESHOLD,
  assertTransition,
  canTransition,
  computeAutoScreenScore,
  isTerminal,
} from './application-state-machine';

describe('application-state-machine', () => {
  describe('canTransition (happy path)', () => {
    it('allows new → screened → interview → offer → hired', () => {
      expect(canTransition('new', 'screened')).toBe(true);
      expect(canTransition('screened', 'interview')).toBe(true);
      expect(canTransition('interview', 'offer')).toBe(true);
      expect(canTransition('offer', 'hired')).toBe(true);
    });
  });

  describe('canTransition (rejection branch)', () => {
    const rejectableFrom: ApplicationStatus[] = ['new', 'screened', 'interview', 'offer'];
    test.each(rejectableFrom)('allows %s → rejected', (from) => {
      expect(canTransition(from, 'rejected')).toBe(true);
    });
  });

  describe('canTransition (forbidden)', () => {
    it('rejects backwards transitions', () => {
      expect(canTransition('screened', 'new')).toBe(false);
      expect(canTransition('interview', 'screened')).toBe(false);
      expect(canTransition('offer', 'interview')).toBe(false);
      expect(canTransition('hired', 'offer')).toBe(false);
    });

    it('rejects same-state (no-op) transitions', () => {
      const all: ApplicationStatus[] = ['new', 'screened', 'interview', 'offer', 'hired', 'rejected'];
      for (const s of all) expect(canTransition(s, s)).toBe(false);
    });

    it('rejects skipping stages', () => {
      expect(canTransition('new', 'interview')).toBe(false);
      expect(canTransition('new', 'offer')).toBe(false);
      expect(canTransition('new', 'hired')).toBe(false);
      expect(canTransition('screened', 'offer')).toBe(false);
      expect(canTransition('screened', 'hired')).toBe(false);
      expect(canTransition('interview', 'hired')).toBe(false);
    });

    it('forbids any move out of terminal states', () => {
      const targets: ApplicationStatus[] = ['new', 'screened', 'interview', 'offer', 'rejected'];
      for (const t of targets) {
        expect(canTransition('hired', t)).toBe(false);
        expect(canTransition('rejected', t)).toBe(false);
      }
    });
  });

  describe('isTerminal', () => {
    it('marks hired and rejected as terminal', () => {
      expect(isTerminal('hired')).toBe(true);
      expect(isTerminal('rejected')).toBe(true);
    });
    it('marks the rest as non-terminal', () => {
      expect(isTerminal('new')).toBe(false);
      expect(isTerminal('screened')).toBe(false);
      expect(isTerminal('interview')).toBe(false);
      expect(isTerminal('offer')).toBe(false);
    });
  });

  describe('assertTransition', () => {
    it('does not throw for valid transitions', () => {
      expect(() => assertTransition('new', 'screened')).not.toThrow();
      expect(() => assertTransition('offer', 'hired')).not.toThrow();
    });

    it('throws with a descriptive message for invalid transitions', () => {
      expect(() => assertTransition('hired', 'rejected')).toThrow(/hired/);
      expect(() => assertTransition('new', 'hired')).toThrow(/new/);
    });
  });

  describe('computeAutoScreenScore', () => {
    it('returns 100 when years and keywords fully match', () => {
      const score = computeAutoScreenScore({
        candidateYears: 5,
        requiredYears: 3,
        cvText: 'experienced react typescript developer',
        postingKeywords: 'react,typescript',
      });
      expect(score).toBe(100);
    });

    it('returns 0 when no experience and no keywords match', () => {
      const score = computeAutoScreenScore({
        candidateYears: 0,
        requiredYears: 5,
        cvText: 'cooking and gardening',
        postingKeywords: 'react,typescript',
      });
      expect(score).toBe(0);
    });

    it('treats empty keywords as a perfect keyword match (60 pts)', () => {
      const score = computeAutoScreenScore({
        candidateYears: 0,
        requiredYears: 0,
        cvText: '',
        postingKeywords: '',
      });
      // requiredYears=0 → expRatio=1 → 40 pts; empty kw → 60 pts → total 100
      expect(score).toBe(100);
    });

    it('caps experience ratio at 1.0 (no double-credit for over-qualified)', () => {
      const overqualified = computeAutoScreenScore({
        candidateYears: 50,
        requiredYears: 1,
        cvText: '',
        postingKeywords: 'react',
      });
      const justEnough = computeAutoScreenScore({
        candidateYears: 1,
        requiredYears: 1,
        cvText: '',
        postingKeywords: 'react',
      });
      expect(overqualified).toBe(justEnough);
    });

    it('AUTO_SCREEN_THRESHOLD is reachable but not trivial', () => {
      expect(AUTO_SCREEN_THRESHOLD).toBeGreaterThanOrEqual(50);
      expect(AUTO_SCREEN_THRESHOLD).toBeLessThanOrEqual(80);
    });
  });
});
