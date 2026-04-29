import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import { AutopilotJob, AutopilotJobContext, AutopilotJobMeta, AutopilotJobResult } from '../autopilot.types';

// Cron: 09:00 UTC Mon-Sat. Check if USD/IQD exchange rate is stale (not updated today).
// Raises a 'medium' exception if the last update was more than 2 business days ago.
// In Iraq, USD/IQD rate changes from CBI (Central Bank of Iraq) daily.

const STALE_RATE_THRESHOLD_DAYS = 2;

@Injectable()
export class FinanceExchangeRateSyncJob implements AutopilotJob {
  private readonly logger = new Logger(FinanceExchangeRateSyncJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'finance.exchange-rate-sync',
    domain: 'finance',
    schedule: '0 9 * * 1-6',
    companyScoped: true,
    titleAr: 'تحديث أسعار الصرف',
    titleEn: 'Exchange Rate Sync',
    description: 'Mon-Sat 09:00 — alerts if USD/IQD exchange rate has not been updated in 2+ days.',
  };

  constructor(private readonly prisma: PrismaService, private readonly engine: AutopilotEngineService) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - STALE_RATE_THRESHOLD_DAYS * 86_400_000);

    const latestRate = await this.prisma.exchangeRate.findFirst({
      where: { companyId: ctx.companyId, fromCurrency: 'USD', toCurrency: 'IQD' },
      orderBy: { effectiveDate: 'desc' },
      select: { id: true, rate: true, effectiveDate: true },
    }).catch(() => null);

    if (!latestRate) {
      let exceptionsRaised = 0;
      try {
        await this.engine.raiseException({
          jobId: this.meta.id, domain: 'finance', companyId: ctx.companyId, severity: 'medium',
          title: 'لا يوجد سعر صرف USD/IQD مُدخَل',
          description: 'لم يُدخَل أي سعر صرف للدولار مقابل الدينار العراقي بعد',
          suggestedAction: 'إدخال سعر الصرف من صفحة إدارة العملات',
          payload: { fromCurrency: 'USD', toCurrency: 'IQD' },
        });
        exceptionsRaised++;
      } catch { /* continue */ }
      return { status: 'exception_raised', itemsProcessed: 0, exceptionsRaised, details: { issue: 'no_rate_found' } };
    }

    const rateDate = new Date(latestRate.effectiveDate);
    if (rateDate >= staleThreshold) {
      return { status: 'completed', itemsProcessed: 1, exceptionsRaised: 0, details: { lastRate: Number(latestRate.rate), lastUpdated: rateDate.toISOString().split('T')[0] } };
    }

    const daysSinceUpdate = Math.floor((now.getTime() - rateDate.getTime()) / 86_400_000);
    let exceptionsRaised = 0;
    try {
      await this.engine.raiseException({
        jobId: this.meta.id, domain: 'finance', companyId: ctx.companyId, severity: 'medium',
        title: `سعر الصرف قديم — لم يُحدَّث منذ ${daysSinceUpdate} يوم`,
        description: `آخر سعر USD/IQD = ${latestRate.rate} (تاريخ: ${rateDate.toISOString().split('T')[0]})`,
        suggestedAction: 'تحديث سعر الصرف يدوياً من صفحة إدارة العملات',
        payload: { lastRate: Number(latestRate.rate), lastUpdatedDate: rateDate.toISOString().split('T')[0], daysSinceUpdate },
      });
      exceptionsRaised++;
    } catch { /* continue */ }

    return { status: 'exception_raised', itemsProcessed: 1, exceptionsRaised, details: { daysSinceUpdate, lastRate: Number(latestRate.rate) } };
  }
}