/**
 * T44 — RFM bucket assignment (pure, deterministic).
 *
 * Recency  = days since last posted SalesInvoice (lower is better)
 * Frequency = number of posted SalesInvoices in the look-back window
 * Monetary  = sum of totalIqd of posted SalesInvoices in the window
 *
 * Each dimension is bucketed into 1..5 using FIXED thresholds (no quintile
 * computation across tenants — keeps the algorithm explainable and
 * reproducible per F4 "النظام يفكر، الموظف ينقر").
 *
 * Segment rules are then applied on the (R,F,M) triple. Thresholds chosen
 * for an Iraqi retail/wholesale ERP, look-back window = 365 days.
 */

/** Fixed look-back window for F + M aggregation. */
export const RFM_WINDOW_DAYS = 365;

/** Days since last posted invoice → R score (5 = most recent). */
export const RECENCY_THRESHOLDS_DAYS: ReadonlyArray<{ maxDays: number; score: number }> = [
  { maxDays: 30,  score: 5 },
  { maxDays: 60,  score: 4 },
  { maxDays: 120, score: 3 },
  { maxDays: 240, score: 2 },
  // > 240 → 1
];

/** Number of posted invoices within window → F score. */
export const FREQUENCY_THRESHOLDS: ReadonlyArray<{ minCount: number; score: number }> = [
  { minCount: 24, score: 5 }, // ~ twice a month
  { minCount: 12, score: 4 },
  { minCount: 6,  score: 3 },
  { minCount: 2,  score: 2 },
  // 0 or 1 → 1
];

/** Sum total IQD within window → M score (Iraqi wholesale calibration). */
export const MONETARY_THRESHOLDS_IQD: ReadonlyArray<{ minIqd: number; score: number }> = [
  { minIqd: 50_000_000, score: 5 },
  { minIqd: 20_000_000, score: 4 },
  { minIqd: 5_000_000,  score: 3 },
  { minIqd: 1_000_000,  score: 2 },
  // < 1M → 1
];

/** R-score from days-since-last-invoice. */
export function recencyScore(days: number | null | undefined): number {
  if (days == null || days < 0) return 1;
  for (const t of RECENCY_THRESHOLDS_DAYS) {
    if (days <= t.maxDays) return t.score;
  }
  return 1;
}

/** F-score from invoice count in window. */
export function frequencyScore(count: number | null | undefined): number {
  if (!count || count < 0) return 1;
  for (const t of FREQUENCY_THRESHOLDS) {
    if (count >= t.minCount) return t.score;
  }
  return 1;
}

/** M-score from monetary total in window. */
export function monetaryScore(totalIqd: number | null | undefined): number {
  if (!totalIqd || totalIqd < 0) return 1;
  for (const t of MONETARY_THRESHOLDS_IQD) {
    if (totalIqd >= t.minIqd) return t.score;
  }
  return 1;
}

export type RfmSegment = 'Champion' | 'Loyal' | 'At-Risk' | 'Lost' | 'New';

/**
 * Segment assignment from the (R,F,M) triple.
 *
 *   Champion:  recent + frequent + high spend       (R≥4, F≥4, M≥4)
 *   Loyal:     frequent buyer, not necessarily top  (F≥4, R≥3)
 *   At-Risk:   used to spend, gone quiet            (R≤2, F≥3 OR M≥3)
 *   Lost:      no recent activity at all            (R=1, F≤1)
 *   New:       only one recent purchase             (R≥4, F≤1)
 *   default → Loyal if F≥3 else At-Risk if R≤2 else New
 *
 * `hasAnyInvoice = false` always returns `New`.
 */
export function assignSegment(
  r: number,
  f: number,
  m: number,
  hasAnyInvoice: boolean,
): RfmSegment {
  if (!hasAnyInvoice) return 'New';

  if (r >= 4 && f >= 4 && m >= 4) return 'Champion';
  if (r === 1 && f <= 1) return 'Lost';
  if (r <= 2 && (f >= 3 || m >= 3)) return 'At-Risk';
  if (r >= 4 && f <= 1) return 'New';
  if (f >= 4 && r >= 3) return 'Loyal';

  // Fallbacks
  if (f >= 3) return 'Loyal';
  if (r <= 2) return 'At-Risk';
  return 'New';
}

export interface RfmInput {
  /** Days since last posted invoice (null = no invoice ever). */
  recencyDays: number | null;
  /** Posted-invoice count in look-back window. */
  frequency: number;
  /** Sum totalIqd in look-back window. */
  monetaryIqd: number;
}

export interface RfmResult {
  rScore: number;
  fScore: number;
  mScore: number;
  segment: RfmSegment;
}

/** Convenience: compute scores + segment from raw inputs. */
export function computeRfm(input: RfmInput): RfmResult {
  const rScore = recencyScore(input.recencyDays);
  const fScore = frequencyScore(input.frequency);
  const mScore = monetaryScore(input.monetaryIqd);
  const hasAny = input.recencyDays != null && input.frequency > 0;
  const segment = assignSegment(rScore, fScore, mScore, hasAny);
  return { rScore, fScore, mScore, segment };
}
