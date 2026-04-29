import { Injectable } from '@nestjs/common';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 — Scaffolded Job Roadmap ───────────────────────────────────────────
// Each entry below is a placeholder for one of the 47 remaining autonomous
// jobs in the T71 catalogue. They register their metadata so the manager UI
// can render the full roadmap (and the `/autopilot/catalogue` endpoint
// returns the complete list), but `execute()` raises NotImplementedError —
// implement each one in a follow-up PR using the same contract as the three
// reference jobs (sales.overdue-reminder, inventory.auto-reorder,
// license.auto-renewal).
//
// All scheduling here is *intentional*: each cron string was chosen to spread
// load across the 24h cycle and to honor business meaning (e.g. reports go
// out Sunday morning, settlements run after midnight). When a stub is
// implemented for real, simply replace the class body — the schedule and
// id stay stable so existing run-history queries keep working.

class NotImplementedError extends Error {
  constructor(jobId: string) {
    super(`scaffold — implement in follow-up (job=${jobId})`);
    this.name = 'NotImplementedError';
  }
}

interface StubSpec {
  meta: AutopilotJobMeta;
}

const SCAFFOLDS: StubSpec[] = [
  // ── Sales (10, minus 3 implemented) ─────────────────────────────────────
  // sales.daily-rep-summary    → implemented in sales.daily-rep-summary.job.ts
  // sales.churn-risk-flag      → implemented in sales.churn-risk-flag.job.ts
  // sales.quotation-followup   → implemented in sales.quotation-followup.job.ts
  { meta: { id: 'sales.commission-calc',       domain: 'sales',       schedule: '0 2 1 * *',   companyScoped: true,  titleAr: 'احتساب العمولات الشهرية',     titleEn: 'Monthly Commission Calc' } },
  { meta: { id: 'sales.price-list-rollover',   domain: 'sales',       schedule: '0 1 1 * *',   companyScoped: true,  titleAr: 'تحديث قوائم الأسعار',         titleEn: 'Price List Rollover' } },
  { meta: { id: 'sales.loyalty-tier-recompute',domain: 'sales',       schedule: '0 4 * * *',   companyScoped: true,  titleAr: 'إعادة احتساب درجات الولاء',   titleEn: 'Loyalty Tier Recompute' } },
  { meta: { id: 'sales.dormant-customer-revive',domain: 'sales',      schedule: '0 11 * * 0',  companyScoped: true,  titleAr: 'تنبيه العملاء غير النشطين',   titleEn: 'Dormant Customer Revive' } },
  { meta: { id: 'sales.target-vs-actual',      domain: 'sales',       schedule: '0 8 * * *',   companyScoped: true,  titleAr: 'مقارنة الأهداف بالمتحقق',     titleEn: 'Target vs Actual' } },
  { meta: { id: 'sales.return-pattern-detect', domain: 'sales',       schedule: '0 5 * * 1',   companyScoped: true,  titleAr: 'كشف أنماط الإرجاع المريبة',    titleEn: 'Return Pattern Detect' } },
  { meta: { id: 'sales.cross-sell-suggester',  domain: 'sales',       schedule: 'event-driven',companyScoped: true,  titleAr: 'مقترحات البيع المتقاطع',      titleEn: 'Cross-sell Suggester' } },

  // ── Inventory (8) ────────────────────────────────────────────────────────
  { meta: { id: 'inventory.stocktake-reminder',domain: 'inventory',   schedule: '0 8 1 * *',   companyScoped: true,  titleAr: 'تذكير الجرد الشهري',           titleEn: 'Stocktake Reminder' } },
  { meta: { id: 'inventory.cost-recalculate',  domain: 'inventory',   schedule: '0 2 * * *',   companyScoped: true,  titleAr: 'إعادة احتساب متوسط التكلفة',  titleEn: 'MWA Cost Recalculate' } },
  { meta: { id: 'inventory.barcode-missing',   domain: 'inventory',   schedule: '0 7 * * 1',   companyScoped: true,  titleAr: 'منتجات بدون باركود',           titleEn: 'Missing Barcode Detect' } },
  { meta: { id: 'inventory.warehouse-balance', domain: 'inventory',   schedule: '0 1 * * *',   companyScoped: true,  titleAr: 'تدقيق أرصدة المستودعات',      titleEn: 'Warehouse Balance Audit' } },
  { meta: { id: 'inventory.shelf-life-alert',  domain: 'inventory',   schedule: '0 6 * * 1',   companyScoped: true,  titleAr: 'تنبيهات قرب نهاية العمر',     titleEn: 'Shelf-Life Alert' } },

  // ── Finance (8) ──────────────────────────────────────────────────────────
  { meta: { id: 'finance.exchange-rate-sync',  domain: 'finance',     schedule: '0 9 * * 1-6', companyScoped: true,  titleAr: 'تحديث أسعار الصرف',           titleEn: 'Exchange Rate Sync' } },
  { meta: { id: 'finance.unbalanced-je-detect',domain: 'finance',     schedule: '0 */6 * * *', companyScoped: true,  titleAr: 'كشف القيود غير المتوازنة',     titleEn: 'Unbalanced JE Detect' } },
  { meta: { id: 'finance.tax-liability-calc',  domain: 'finance',     schedule: '0 7 1 * *',   companyScoped: true,  titleAr: 'احتساب الالتزامات الضريبية',   titleEn: 'Tax Liability Calc' } },
  { meta: { id: 'finance.cashflow-forecast',   domain: 'finance',     schedule: '0 7 * * 0',   companyScoped: true,  titleAr: 'توقع التدفق النقدي',           titleEn: 'Cashflow Forecast' } },

  // ── HR (6) ───────────────────────────────────────────────────────────────
  { meta: { id: 'hr.birthday-greeting',        domain: 'hr',          schedule: '0 9 * * *',   companyScoped: true,  titleAr: 'تهنئة أعياد الميلاد',          titleEn: 'Birthday Greeting' } },
  { meta: { id: 'hr.probation-end-flag',       domain: 'hr',          schedule: '0 10 * * *',  companyScoped: true,  titleAr: 'تنبيه نهاية فترة التجربة',     titleEn: 'Probation End Flag' } },

  // ── CRM (5, minus 3 implemented) ─────────────────────────────────────────
  // crm.lead-scoring-refresh   → implemented in crm.lead-scoring-refresh.job.ts
  // crm.followup-reminder      → implemented in crm.followup-reminder.job.ts
  // crm.silent-churn-alert     → implemented in crm.silent-churn-alert.job.ts
  { meta: { id: 'crm.duplicate-merge-suggest', domain: 'crm',         schedule: '0 4 * * 1',   companyScoped: true,  titleAr: 'مقترحات دمج العملاء المكررين',  titleEn: 'Duplicate Merge Suggest' } },
  { meta: { id: 'crm.nps-pulse',               domain: 'crm',         schedule: '0 10 * * 0',  companyScoped: true,  titleAr: 'إرسال استطلاع رضا',            titleEn: 'NPS Pulse' } },

  // ── Delivery (5) ─────────────────────────────────────────────────────────
  { meta: { id: 'delivery.driver-load-balance',domain: 'delivery',    schedule: '0 6 * * *',   companyScoped: true,  titleAr: 'موازنة حمل السائقين',          titleEn: 'Driver Load Balance' } },
  { meta: { id: 'delivery.eta-deviation',      domain: 'delivery',    schedule: '*/30 * * * *',companyScoped: true,  titleAr: 'كشف انحراف وقت الوصول',        titleEn: 'ETA Deviation' } },
  { meta: { id: 'delivery.zone-coverage-audit',domain: 'delivery',    schedule: '0 2 * * 1',   companyScoped: true,  titleAr: 'تدقيق تغطية المناطق',          titleEn: 'Zone Coverage Audit' } },

  // ── Procurement (3, minus 2 implemented) ─────────────────────────────────
  // procurement.vendor-scorecard  → implemented in procurement.vendor-scorecard.job.ts
  // procurement.price-drift-alert → implemented in procurement.price-drift-alert.job.ts
  { meta: { id: 'procurement.three-way-match', domain: 'procurement', schedule: '0 4 * * *',   companyScoped: true,  titleAr: 'مطابقة ثلاثية تلقائية',        titleEn: 'Three-way Match' } },

  // ── License (2) ──────────────────────────────────────────────────────────
  { meta: { id: 'license.heartbeat-check',     domain: 'license',     schedule: '0 */4 * * *', companyScoped: true,  titleAr: 'فحص نبضات التراخيص',           titleEn: 'License Heartbeat Check' } },
  { meta: { id: 'license.usage-report',        domain: 'license',     schedule: '0 6 1 * *',   companyScoped: true,  titleAr: 'تقرير استخدام التراخيص',       titleEn: 'License Usage Report' } },
];

@Injectable()
export class AutopilotJobScaffolds {
  /**
   * Returns one AutopilotJob per scaffold spec. Each job's `execute()` throws
   * a NotImplementedError so the engine logs a clean failure row in
   * autopilot_job_runs without polluting business data.
   */
  buildAll(): AutopilotJob[] {
    return SCAFFOLDS.map((spec) => ({
      meta: spec.meta,
      execute: async (
        _ctx: AutopilotJobContext,
      ): Promise<AutopilotJobResult> => {
        throw new NotImplementedError(spec.meta.id);
      },
    }));
  }

  count(): number {
    return SCAFFOLDS.length;
  }
}
