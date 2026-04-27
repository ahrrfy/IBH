/**
 * Application status state machine for HR Recruitment (T51).
 *
 * Allowed transitions:
 *
 *   new ──► screened ──► interview ──► offer ──► hired
 *    │         │             │           │
 *    ▼         ▼             ▼           ▼
 *   rejected  rejected     rejected    rejected
 *
 * - Cannot move backwards.
 * - `hired` and `rejected` are terminal.
 * - `new` may be auto-promoted to `screened` by the rule-based scorer.
 *
 * Pure helper — no IO. Used by the service AND directly by unit tests.
 */
export type ApplicationStatus =
  | 'new'
  | 'screened'
  | 'interview'
  | 'offer'
  | 'hired'
  | 'rejected';

const ALLOWED: Record<ApplicationStatus, ApplicationStatus[]> = {
  new: ['screened', 'rejected'],
  screened: ['interview', 'rejected'],
  interview: ['offer', 'rejected'],
  offer: ['hired', 'rejected'],
  hired: [], // terminal
  rejected: [], // terminal
};

/**
 * Returns true if `from → to` is a permitted state transition.
 * Same-state (no-op) is rejected to make audit trails clean.
 */
export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  if (from === to) return false;
  return ALLOWED[from].includes(to);
}

/**
 * Throws a descriptive error if the transition is invalid.
 * Use inside the service before any DB write.
 */
export function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid application status transition: ${from} → ${to}. ` +
        `Allowed from "${from}": [${ALLOWED[from].join(', ') || 'terminal'}]`,
    );
  }
}

/** True if the status cannot transition further. */
export function isTerminal(status: ApplicationStatus): boolean {
  return ALLOWED[status].length === 0;
}

/**
 * Rule-based auto-screen scorer (Tier 3 only — no AI per F5).
 *
 * Score (0-100) = experience match (40%) + keyword match (60%).
 *
 *   - experience: ratio of candidate years vs required years (capped at 1.0)
 *   - keywords:  fraction of posting keywords present in CV/cover letter text
 *
 * A score >= 60 auto-promotes `new → screened`. Hiring managers can still
 * manually move any application; this just gives them a sorted shortlist.
 */
export function computeAutoScreenScore(input: {
  candidateYears: number;
  requiredYears: number;
  cvText: string;
  postingKeywords: string;
}): number {
  const years = Math.max(0, input.candidateYears);
  const required = Math.max(0, input.requiredYears);
  const expRatio = required === 0 ? 1 : Math.min(1, years / required);

  const kwList = (input.postingKeywords || '')
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);

  let kwScore = 1;
  if (kwList.length > 0) {
    const haystack = (input.cvText || '').toLowerCase();
    const matched = kwList.filter((k) => haystack.includes(k)).length;
    kwScore = matched / kwList.length;
  }

  const score = Math.round(expRatio * 40 + kwScore * 60);
  return Math.max(0, Math.min(100, score));
}

/** Threshold at which `new → screened` auto-promotion fires. */
export const AUTO_SCREEN_THRESHOLD = 60;
