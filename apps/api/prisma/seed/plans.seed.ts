/**
 * T60 — Subscription Plans Definition
 *
 * Idempotent seed for the canonical subscription plans (Starter / Professional /
 * Enterprise / Bundle) and their bundled feature codes. Re-running this seed is
 * safe: plans are upserted by `code`, and features are upserted by the unique
 * (planId, featureCode) compound key.
 *
 * Plan tiers are designed to be inclusive: Starter ⊂ Professional ⊂ Enterprise.
 * The `bundle` plan is a non-public template — Sales activates it per-customer
 * by adding `SubscriptionFeature` overrides for the cherry-picked features.
 *
 * Pricing is in IQD (Iraqi Dinar). Annual price = 11 × monthly (one month free).
 */
import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Canonical feature code catalog. These IDs are stable contracts — once a code
 * is shipped to production it must NEVER be renamed. Feature gates in the API
 * key off these strings.
 */
export const FEATURE_CODES = {
  // Sales / POS / inventory baseline (Starter+)
  SALES: 'sales',
  POS: 'pos',
  INVENTORY_BASIC: 'inventory.basic',
  REPORTS_BASIC: 'reports.basic',

  // Operations bundle (Professional+)
  HR_CORE: 'hr.core',
  HR_PAYROLL: 'hr.payroll',
  FINANCE_GL: 'finance.gl',
  FINANCE_AR_AP: 'finance.ar_ap',
  DELIVERY: 'delivery',
  PURCHASES: 'purchases',
  CRM: 'crm',
  INVENTORY_SMART: 'inventory.smart',

  // Enterprise-only
  MANUFACTURING: 'manufacturing',
  ECOMMERCE: 'ecommerce',
  AI_TIER3: 'ai.tier3',
  AI_TIER2: 'ai.tier2',
  AI_TIER1: 'ai.tier1',
  REPORTS_ADVANCED: 'reports.advanced',
  OMNICHANNEL: 'omnichannel',
  FIXED_ASSETS: 'finance.fixed_assets',
  FINANCE_BUDGET: 'finance.budget',
} as const;

export type FeatureCode = (typeof FEATURE_CODES)[keyof typeof FEATURE_CODES];

/**
 * Stable plan codes. Used as upsert keys and referenced by Subscription.planId
 * lookups in API code.
 */
export const PLAN_CODES = {
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
  BUNDLE: 'bundle',
} as const;

export type PlanCode = (typeof PLAN_CODES)[keyof typeof PLAN_CODES];

interface PlanDefinition {
  code: PlanCode;
  name: string;
  description: string;
  monthlyPriceIqd: string;
  maxUsers: number | null;
  maxBranches: number | null;
  maxCompanies: number;
  sortOrder: number;
  isPublic: boolean;
  features: FeatureCode[];
}

const STARTER_FEATURES: FeatureCode[] = [
  FEATURE_CODES.SALES,
  FEATURE_CODES.POS,
  FEATURE_CODES.INVENTORY_BASIC,
  FEATURE_CODES.REPORTS_BASIC,
];

const PROFESSIONAL_FEATURES: FeatureCode[] = [
  ...STARTER_FEATURES,
  FEATURE_CODES.HR_CORE,
  FEATURE_CODES.HR_PAYROLL,
  FEATURE_CODES.FINANCE_GL,
  FEATURE_CODES.FINANCE_AR_AP,
  FEATURE_CODES.DELIVERY,
  FEATURE_CODES.PURCHASES,
  FEATURE_CODES.CRM,
  FEATURE_CODES.INVENTORY_SMART,
];

const ENTERPRISE_FEATURES: FeatureCode[] = [
  ...PROFESSIONAL_FEATURES,
  FEATURE_CODES.MANUFACTURING,
  FEATURE_CODES.ECOMMERCE,
  FEATURE_CODES.AI_TIER3,
  FEATURE_CODES.AI_TIER2,
  FEATURE_CODES.AI_TIER1,
  FEATURE_CODES.REPORTS_ADVANCED,
  FEATURE_CODES.OMNICHANNEL,
  FEATURE_CODES.FIXED_ASSETS,
  FEATURE_CODES.FINANCE_BUDGET,
];

/**
 * Plan catalog. Pricing in IQD, annual = monthly × 11 (one month free).
 *
 * Bundle plan is a non-public template — it ships with zero features enabled
 * by default. Sales activates per-customer by adding `SubscriptionFeature`
 * overrides on the customer's Subscription row.
 */
const PLANS: PlanDefinition[] = [
  {
    code: PLAN_CODES.STARTER,
    name: 'Starter',
    description:
      'نقطة بيع + مبيعات + مخزون أساسي — للمتاجر الصغيرة وفرع واحد. Sales + POS + basic inventory for small single-branch shops.',
    monthlyPriceIqd: '150000.00',
    maxUsers: 5,
    maxBranches: 1,
    maxCompanies: 1,
    sortOrder: 10,
    isPublic: true,
    features: STARTER_FEATURES,
  },
  {
    code: PLAN_CODES.PROFESSIONAL,
    name: 'Professional',
    description:
      'كل ما في Starter + موارد بشرية + مالية + توصيل + مشتريات + CRM. Adds HR, finance, delivery, purchases, CRM and smart inventory.',
    monthlyPriceIqd: '400000.00',
    maxUsers: 25,
    maxBranches: 3,
    maxCompanies: 1,
    sortOrder: 20,
    isPublic: true,
    features: PROFESSIONAL_FEATURES,
  },
  {
    code: PLAN_CODES.ENTERPRISE,
    name: 'Enterprise',
    description:
      'كل الميزات بدون حدود — تصنيع + تجارة إلكترونية + ذكاء اصطناعي. Unlimited tier with manufacturing, e-commerce, full AI stack.',
    monthlyPriceIqd: '1000000.00',
    maxUsers: null,
    maxBranches: null,
    maxCompanies: 1,
    sortOrder: 30,
    isPublic: true,
    features: ENTERPRISE_FEATURES,
  },
  {
    code: PLAN_CODES.BUNDLE,
    name: 'Bundle (Custom)',
    description:
      'باقة مفصّلة — اختر الميزات والسعر حسب الاتفاق. Custom feature picking and custom pricing — Sales activates features per Subscription.',
    monthlyPriceIqd: '0.00',
    maxUsers: null,
    maxBranches: null,
    maxCompanies: 1,
    sortOrder: 90,
    isPublic: false,
    features: [],
  },
];

/**
 * Upsert all canonical plans + their bundled features. Idempotent.
 *
 * Behaviour:
 *   - Plans matched by `code`. Existing plans get their pricing/limits/feature
 *     snapshot refreshed.
 *   - Features matched by (planId, featureCode). Stale features that were
 *     previously bundled but were dropped from the plan get disabled
 *     (`isEnabled = false`) — never deleted, to preserve history.
 */
export async function seedPlans(prisma: PrismaClient): Promise<void> {
  console.log('🌱 [T60] Seeding subscription plans + features...');

  for (const def of PLANS) {
    const monthly = new Prisma.Decimal(def.monthlyPriceIqd);
    const annual = monthly.mul(11); // one month free on annual billing

    const featureSnapshot: Record<string, boolean> = {};
    for (const code of def.features) featureSnapshot[code] = true;

    const plan = await prisma.plan.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        description: def.description,
        monthlyPriceIqd: monthly,
        annualPriceIqd: annual,
        maxUsers: def.maxUsers,
        maxBranches: def.maxBranches,
        maxCompanies: def.maxCompanies,
        featureSnapshot,
        sortOrder: def.sortOrder,
        isPublic: def.isPublic,
        isActive: true,
      },
      create: {
        code: def.code,
        name: def.name,
        description: def.description,
        monthlyPriceIqd: monthly,
        annualPriceIqd: annual,
        maxUsers: def.maxUsers,
        maxBranches: def.maxBranches,
        maxCompanies: def.maxCompanies,
        featureSnapshot,
        sortOrder: def.sortOrder,
        isPublic: def.isPublic,
        isActive: true,
      },
    });

    // Upsert bundled features — re-enable any that were previously disabled.
    for (const featureCode of def.features) {
      await prisma.planFeature.upsert({
        where: { planId_featureCode: { planId: plan.id, featureCode } },
        update: { isEnabled: true },
        create: { planId: plan.id, featureCode, isEnabled: true },
      });
    }

    // Soft-disable any stale features that were dropped from this plan.
    const bundled = new Set<string>(def.features);
    const existing = await prisma.planFeature.findMany({
      where: { planId: plan.id },
      select: { featureCode: true, isEnabled: true },
    });
    for (const row of existing) {
      if (!bundled.has(row.featureCode) && row.isEnabled) {
        await prisma.planFeature.update({
          where: {
            planId_featureCode: {
              planId: plan.id,
              featureCode: row.featureCode,
            },
          },
          data: { isEnabled: false },
        });
      }
    }

    console.log(
      `   ✅ ${def.name.padEnd(20)} (${def.features.length} features, ${def.maxUsers ?? '∞'} users, ${def.maxBranches ?? '∞'} branches)`,
    );
  }

  console.log('✅ [T60] Plans seeded.');
}

// Allow standalone execution: `pnpm tsx prisma/seed/plans.seed.ts`
if (require.main === module) {
  const prisma = new PrismaClient();
  seedPlans(prisma)
    .catch((e) => {
      console.error('❌ Plans seed failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
