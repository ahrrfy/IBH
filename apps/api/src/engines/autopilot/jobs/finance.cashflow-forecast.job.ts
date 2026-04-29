import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

const HORIZON_DAYS = 30;

/**
 * Sunday 07:00 — simple 30-day cashflow outlook.
 * AR: unpaid SalesInvoice balanceIqd (expected inflow).
 * AP: approved POs with expectedDate in window (expected outflow).
 * Raises advisory if net forecast is negative.
 */
@Injectable()
export class FinanceCashflowForecastJob implements AutopilotJob {
  private readonly logger = new Logger(FinanceCashflowForecastJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'finance.cashflow-forecast',
    domain: 'finance',
    schedule: '0 7 * * 0',
    companyScoped: true,
    titleAr: 'توقع التدفق النقدي',
    titleEn: 'Cashflow Forecast',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { companyId } = ctx;
    const now     = new Date();
    const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);

    let arAgg: { _sum: { balanceIqd: unknown }; _count: { id: number } };
    let apAgg: { _sum: { totalIqd: unknown }; _count: { id: number } };

    try {
      [arAgg, apAgg] = await Promise.all([
        this.prisma.salesInvoice.aggregate({
          where: { companyId, status: 'posted', balanceIqd: { gt: 0 } },
          _sum: { balanceIqd: true },
          _count: { id: true },
        }),
        this.prisma.purchaseOrder.aggregate({
          where: {
            companyId,
            status: { in: ['approved', 'partially_received'] as any[] },
            expectedDate: { lte: horizon },
          },
          _sum: { totalIqd: true },
          _count: { id: true },
        }),
      ]);
    } catch (err) {
      this.logger.error(`[${this.meta.id}] ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'failed', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    const expectedInflow  = Number((arAgg._sum.balanceIqd as any) ?? 0);
    const expectedOutflow = Number((apAgg._sum.totalIqd as any) ?? 0);
    const netForecast     = expectedInflow - expectedOutflow;
    const totalDocs       = arAgg._count.id + apAgg._count.id;

    if (netForecast >= 0) {
      return {
        status: 'completed',
        itemsProcessed: totalDocs,
        exceptionsRaised: 0,
        details: { expectedInflowIqd: expectedInflow, expectedOutflowIqd: expectedOutflow, netForecastIqd: netForecast },
      };
    }

    await this.engine.raiseException({
      jobId: this.meta.id, domain: 'finance', companyId,
      severity: Math.abs(netForecast) > 10_000_000 ? 'high' : 'medium',
      title: 'توقع تدفق نقدي سالب',
      description: `التدفق النقدي (${HORIZON_DAYS} يوم): صافي سالب ${Math.abs(netForecast).toLocaleString('ar')} د.ع`,
      suggestedAction: 'مراجعة الذمم المدينة وتسريع التحصيل أو تأجيل بعض المشتريات',
      payload: { expectedInflowIqd: expectedInflow, expectedOutflowIqd: expectedOutflow, netForecastIqd: netForecast },
    });

    return {
      status: 'exception_raised',
      itemsProcessed: totalDocs,
      exceptionsRaised: 1,
      details: { expectedInflowIqd: expectedInflow, expectedOutflowIqd: expectedOutflow, netForecastIqd: netForecast },
    };
  }
}