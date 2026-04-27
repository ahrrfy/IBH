// ─── T42 — Quality Rules Q01..Q12 (Tier 3, zero-AI) ─────────────────────────
// Each rule receives a SkuSnapshot and returns either null (healthy) or a
// FlagDraft describing why the SKU was flagged. Rules are PURE FUNCTIONS — no
// DB access, no side effects — so they're trivial to unit-test.
//
// F4 / F5: Tier 3 only. AI suggestions are explicitly out of scope until at
// least 6 months of real production data are available (see CLAUDE.md F5).

import { Prisma } from '@prisma/client';

const D = (v: number | string | Prisma.Decimal | null | undefined): number =>
  v == null ? 0 : typeof v === 'number' ? v : Number(v.toString());

/**
 * Snapshot of one SKU at one warehouse, plus its 90-day sales history. The
 * intelligence service builds these snapshots once per scan and feeds them to
 * every rule, so the rules never hit the database.
 */
export interface SkuSnapshot {
  variantId: string;
  warehouseId: string;
  companyId: string;
  qtyOnHand: number;
  qtyReserved: number;
  avgCostIqd: number;
  // Reorder configuration (may be null if no ROP set)
  reorderQty: number | null;
  leadTimeDays: number | null;
  safetyStock: number | null;
  // Latest selling price found on any active price list (IQD)
  sellingPriceIqd: number | null;
  // Aggregated sales history (last 90 days, IQD-only invoices)
  salesQtyLast30: number;
  salesQtyLast90: number;
  salesIqdLast90: number;
  cogsIqdLast90: number;
  lastMovementAt: Date | null;
  lastInboundCostIqd: number | null;
  // Batch / expiry metadata picked from the freshest open StockLedger entry
  earliestExpiryAt: Date | null;
  daysToEarliestExpiry: number | null;
  // Static product info
  templateNameAr: string;
  templateType: string;
  isActive: boolean;
}

export type RuleSeverity = 'info' | 'warning' | 'critical';

export interface FlagDraft {
  ruleCode: string;             // Q01..Q12
  severity: RuleSeverity;
  messageAr: string;
  messageEn?: string;
  metric?: number;
  threshold?: number;
  payload?: Record<string, unknown>;
}

export interface RuleContext {
  /** Days a SKU must be still to be classed slow-moving (Q01). Default 60. */
  slowMovingDays: number;
  /** Multiple of average daily sales above which we flag overstock (Q02). */
  overstockMultiple: number;
  /** Days before expiry to start warning (Q04). */
  expiringSoonDays: number;
  /** Margin floor (%) below which we flag negative/poor margin (Q05). */
  marginFloorPct: number;
  /** Reservation ratio above which we flag stock-bottleneck (Q08). */
  reservedRatioThreshold: number;
}

export const DEFAULT_RULE_CONTEXT: RuleContext = {
  slowMovingDays: 60,
  overstockMultiple: 6,
  expiringSoonDays: 30,
  marginFloorPct: 5,
  reservedRatioThreshold: 0.8,
};

export type Rule = (sku: SkuSnapshot, ctx: RuleContext) => FlagDraft | null;

// ─── Q01 — Slow-moving (no sales for N days) ─────────────────────────────────
export const Q01_slowMoving: Rule = (sku, ctx) => {
  if (sku.qtyOnHand <= 0) return null;
  if (sku.salesQtyLast90 > 0) return null;
  const daysIdle = sku.lastMovementAt
    ? Math.floor((Date.now() - sku.lastMovementAt.getTime()) / 86_400_000)
    : 9999;
  if (daysIdle < ctx.slowMovingDays) return null;
  return {
    ruleCode: 'Q01',
    severity: 'warning',
    messageAr: `صنف بطيء الحركة — لا مبيعات منذ ${daysIdle} يوماً`,
    messageEn: `Slow-moving — no sales for ${daysIdle} days`,
    metric: daysIdle,
    threshold: ctx.slowMovingDays,
    payload: { qtyOnHand: sku.qtyOnHand, capitalLockedIqd: sku.qtyOnHand * sku.avgCostIqd },
  };
};

// ─── Q02 — Overstock (qty >> daily sales × multiple) ─────────────────────────
export const Q02_overstock: Rule = (sku, ctx) => {
  const dailySales = sku.salesQtyLast90 / 90;
  if (dailySales <= 0) return null; // handled by Q01
  const daysOfCover = sku.qtyOnHand / dailySales;
  const threshold = (sku.leadTimeDays ?? 7) * ctx.overstockMultiple;
  if (daysOfCover < threshold) return null;
  return {
    ruleCode: 'Q02',
    severity: 'warning',
    messageAr: `مخزون فائض — ${Math.round(daysOfCover)} يوم تغطية (الحد ${Math.round(threshold)})`,
    messageEn: `Overstock — ${Math.round(daysOfCover)}d cover (limit ${Math.round(threshold)})`,
    metric: daysOfCover,
    threshold,
    payload: { dailySales, qtyOnHand: sku.qtyOnHand },
  };
};

// ─── Q03 — Low stock (below ROP — drives auto-reorder) ───────────────────────
export const Q03_lowStock: Rule = (sku) => {
  if (!sku.isActive) return null;
  if (sku.templateType === 'service' || sku.templateType === 'bundle') return null;

  const dailySales = sku.salesQtyLast90 / 90;
  const lead = sku.leadTimeDays ?? 7;
  const safety = sku.safetyStock ?? 0;
  const computedROP = dailySales * lead + safety;
  const rop = sku.reorderQty != null ? sku.reorderQty : computedROP;
  if (rop <= 0) return null;
  if (sku.qtyOnHand > rop) return null;

  const severity: RuleSeverity = sku.qtyOnHand <= 0 ? 'critical' : 'warning';
  return {
    ruleCode: 'Q03',
    severity,
    messageAr: `الرصيد تحت نقطة إعادة الطلب (${sku.qtyOnHand} ≤ ${Math.round(rop)})`,
    messageEn: `Below reorder point (${sku.qtyOnHand} ≤ ${Math.round(rop)})`,
    metric: sku.qtyOnHand,
    threshold: rop,
    payload: { dailySales, leadTimeDays: lead, safetyStock: safety, computedROP },
  };
};

// ─── Q04 — Expiring soon ─────────────────────────────────────────────────────
export const Q04_expiringSoon: Rule = (sku, ctx) => {
  if (sku.daysToEarliestExpiry == null) return null;
  if (sku.qtyOnHand <= 0) return null;
  if (sku.daysToEarliestExpiry > ctx.expiringSoonDays) return null;
  const severity: RuleSeverity = sku.daysToEarliestExpiry <= 0 ? 'critical' : 'warning';
  return {
    ruleCode: 'Q04',
    severity,
    messageAr: severity === 'critical'
      ? `صنف منتهي الصلاحية`
      : `صنف قارب على انتهاء الصلاحية خلال ${sku.daysToEarliestExpiry} يوم`,
    messageEn: severity === 'critical'
      ? `Expired stock`
      : `Expiring in ${sku.daysToEarliestExpiry} days`,
    metric: sku.daysToEarliestExpiry,
    threshold: ctx.expiringSoonDays,
    payload: { earliestExpiryAt: sku.earliestExpiryAt, qtyOnHand: sku.qtyOnHand },
  };
};

// ─── Q05 — Negative / poor margin ────────────────────────────────────────────
export const Q05_negativeMargin: Rule = (sku, ctx) => {
  if (sku.sellingPriceIqd == null || sku.sellingPriceIqd <= 0) return null;
  if (sku.avgCostIqd <= 0) return null;
  const marginPct = ((sku.sellingPriceIqd - sku.avgCostIqd) / sku.sellingPriceIqd) * 100;
  if (marginPct >= ctx.marginFloorPct) return null;
  const severity: RuleSeverity = marginPct < 0 ? 'critical' : 'warning';
  return {
    ruleCode: 'Q05',
    severity,
    messageAr: marginPct < 0
      ? `سعر البيع أقل من التكلفة (هامش ${marginPct.toFixed(1)}%)`
      : `هامش ربح منخفض (${marginPct.toFixed(1)}% < ${ctx.marginFloorPct}%)`,
    messageEn: `Margin ${marginPct.toFixed(1)}%`,
    metric: marginPct,
    threshold: ctx.marginFloorPct,
    payload: { avgCostIqd: sku.avgCostIqd, sellingPriceIqd: sku.sellingPriceIqd },
  };
};

// ─── Q06 — Cost spike (last inbound cost > 25% above moving avg) ─────────────
export const Q06_costSpike: Rule = (sku) => {
  if (sku.lastInboundCostIqd == null) return null;
  if (sku.avgCostIqd <= 0) return null;
  const drift = (sku.lastInboundCostIqd - sku.avgCostIqd) / sku.avgCostIqd;
  if (drift < 0.25) return null;
  return {
    ruleCode: 'Q06',
    severity: 'warning',
    messageAr: `قفزة في تكلفة الشراء (+${(drift * 100).toFixed(1)}%)`,
    messageEn: `Cost spike (+${(drift * 100).toFixed(1)}%)`,
    metric: drift * 100,
    threshold: 25,
    payload: { avgCostIqd: sku.avgCostIqd, lastInboundCostIqd: sku.lastInboundCostIqd },
  };
};

// ─── Q07 — Negative balance (should never happen — F3 safety net) ────────────
export const Q07_negativeBalance: Rule = (sku) => {
  if (sku.qtyOnHand >= 0) return null;
  return {
    ruleCode: 'Q07',
    severity: 'critical',
    messageAr: `رصيد سالب — انتهاك مبدأ F3 (${sku.qtyOnHand})`,
    messageEn: `Negative balance — F3 violation (${sku.qtyOnHand})`,
    metric: sku.qtyOnHand,
    threshold: 0,
    payload: {},
  };
};

// ─── Q08 — Bottleneck: >80% of stock reserved ────────────────────────────────
export const Q08_reservationBottleneck: Rule = (sku, ctx) => {
  if (sku.qtyOnHand <= 0) return null;
  const ratio = sku.qtyReserved / sku.qtyOnHand;
  if (ratio < ctx.reservedRatioThreshold) return null;
  return {
    ruleCode: 'Q08',
    severity: 'warning',
    messageAr: `أكثر من ${(ratio * 100).toFixed(0)}% من المخزون محجوز`,
    messageEn: `${(ratio * 100).toFixed(0)}% of stock reserved`,
    metric: ratio,
    threshold: ctx.reservedRatioThreshold,
    payload: { qtyOnHand: sku.qtyOnHand, qtyReserved: sku.qtyReserved },
  };
};

// ─── Q09 — Inactive variant still holding stock ──────────────────────────────
export const Q09_inactiveWithStock: Rule = (sku) => {
  if (sku.isActive) return null;
  if (sku.qtyOnHand <= 0) return null;
  return {
    ruleCode: 'Q09',
    severity: 'info',
    messageAr: `صنف غير نشط ولكنه يحمل رصيد (${sku.qtyOnHand})`,
    messageEn: `Inactive variant carrying stock (${sku.qtyOnHand})`,
    metric: sku.qtyOnHand,
    payload: {},
  };
};

// ─── Q10 — No sales nor inbound for 180+ days (deeper than Q01) ──────────────
export const Q10_dormant: Rule = (sku) => {
  if (sku.qtyOnHand <= 0) return null;
  if (!sku.lastMovementAt) {
    return {
      ruleCode: 'Q10',
      severity: 'warning',
      messageAr: `صنف خامل تماماً — لا حركة سجل مخزون`,
      messageEn: `Dormant — no ledger movement at all`,
      metric: 9999,
      threshold: 180,
      payload: {},
    };
  }
  const daysIdle = Math.floor((Date.now() - sku.lastMovementAt.getTime()) / 86_400_000);
  if (daysIdle < 180) return null;
  return {
    ruleCode: 'Q10',
    severity: 'warning',
    messageAr: `صنف خامل منذ ${daysIdle} يوماً`,
    messageEn: `Dormant ${daysIdle} days`,
    metric: daysIdle,
    threshold: 180,
    payload: { capitalLockedIqd: sku.qtyOnHand * sku.avgCostIqd },
  };
};

// ─── Q11 — Capital tied up (>5M IQD locked in slow item) ─────────────────────
export const Q11_capitalLocked: Rule = (sku) => {
  const value = sku.qtyOnHand * sku.avgCostIqd;
  if (value < 5_000_000) return null;
  if (sku.salesQtyLast30 > 0) return null;
  return {
    ruleCode: 'Q11',
    severity: 'warning',
    messageAr: `${(value / 1_000_000).toFixed(1)} م.د.ع مجمّدة في صنف بدون حركة`,
    messageEn: `${(value / 1_000_000).toFixed(1)}M IQD locked with no recent sales`,
    metric: value,
    threshold: 5_000_000,
    payload: { qtyOnHand: sku.qtyOnHand, avgCostIqd: sku.avgCostIqd },
  };
};

// ─── Q12 — Velocity spike (last-30 sales > 3× the prior-60 daily rate) ───────
export const Q12_velocitySpike: Rule = (sku) => {
  const dailyRecent = sku.salesQtyLast30 / 30;
  const prior60 = Math.max(0, sku.salesQtyLast90 - sku.salesQtyLast30);
  const dailyPrior = prior60 / 60;
  if (dailyPrior <= 0) return null;
  const ratio = dailyRecent / dailyPrior;
  if (ratio < 3) return null;
  return {
    ruleCode: 'Q12',
    severity: 'info',
    messageAr: `قفزة طلب — معدل آخر 30 يوماً ×${ratio.toFixed(1)} عن السابق`,
    messageEn: `Demand spike — last-30 rate is ${ratio.toFixed(1)}× prior`,
    metric: ratio,
    threshold: 3,
    payload: { dailyRecent, dailyPrior },
  };
};

export const ALL_RULES: ReadonlyArray<Rule> = Object.freeze([
  Q01_slowMoving,
  Q02_overstock,
  Q03_lowStock,
  Q04_expiringSoon,
  Q05_negativeMargin,
  Q06_costSpike,
  Q07_negativeBalance,
  Q08_reservationBottleneck,
  Q09_inactiveWithStock,
  Q10_dormant,
  Q11_capitalLocked,
  Q12_velocitySpike,
]);

export const RULE_CATALOGUE: ReadonlyArray<{
  code: string;
  titleAr: string;
  titleEn: string;
  category: 'movement' | 'cost' | 'expiry' | 'integrity' | 'demand';
}> = Object.freeze([
  { code: 'Q01', titleAr: 'بطيء الحركة', titleEn: 'Slow-moving', category: 'movement' },
  { code: 'Q02', titleAr: 'مخزون فائض', titleEn: 'Overstock', category: 'movement' },
  { code: 'Q03', titleAr: 'تحت نقطة إعادة الطلب', titleEn: 'Below reorder point', category: 'movement' },
  { code: 'Q04', titleAr: 'قارب الانتهاء', titleEn: 'Expiring soon', category: 'expiry' },
  { code: 'Q05', titleAr: 'هامش ربح منخفض', titleEn: 'Negative margin', category: 'cost' },
  { code: 'Q06', titleAr: 'قفزة تكلفة', titleEn: 'Cost spike', category: 'cost' },
  { code: 'Q07', titleAr: 'رصيد سالب', titleEn: 'Negative balance', category: 'integrity' },
  { code: 'Q08', titleAr: 'مخزون محجوز بكثرة', titleEn: 'Reservation bottleneck', category: 'integrity' },
  { code: 'Q09', titleAr: 'صنف غير نشط برصيد', titleEn: 'Inactive with stock', category: 'integrity' },
  { code: 'Q10', titleAr: 'خامل', titleEn: 'Dormant', category: 'movement' },
  { code: 'Q11', titleAr: 'رأس مال مجمّد', titleEn: 'Capital locked', category: 'cost' },
  { code: 'Q12', titleAr: 'قفزة طلب', titleEn: 'Demand spike', category: 'demand' },
]);

// Helper exposed for the snapshot builder.
export { D as toNumber };
