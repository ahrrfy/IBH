import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

/**
 * Monthly 1st 07:00 — aggregate taxIqd from posted SalesInvoices in the previous
 * month and raise an advisory so the accountant can file the tax return.
 */
@Injectable()
export class FinanceTaxLiabilityCalcJob implements AutopilotJob {
  private readonly logger = new Logger(FinanceTaxLiabilityCalcJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'finance.tax-liability-calc',
    domain: 'finance',
    schedule: '0 7 1 * *',
    companyScoped: true,
    titleAr: 'احتساب الالتزامات الضريبية',
    titleEn: 'Tax Liability Calc',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { companyId } = ctx;
    const now = new Date();
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevMonthEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    let result: { _sum: { taxIqd: unknown; totalIqd: unknown }; _count: { _all: number } };
    try {
      result = await this.prisma.salesInvoice.aggregate({
        where: { companyId, status: 'posted', createdAt: { gte: prevMonthStart, lt: prevMonthEnd } },
        _sum: { taxIqd: true, totalIqd: true },
        _count: { _all: true },
      });
    } catch (err) {
      this.logger.error(`[${this.meta.id}] ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'failed', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    const invoices   = result._count._all;
    if (invoices === 0) {
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0 };
    }

    const totalTax   = Number((result._sum.taxIqd as any) ?? 0);
    const totalSales = Number((result._sum.totalIqd as any) ?? 0);
    const monthName  = prevMonthStart.toLocaleString('ar', { month: 'long', timeZone: 'UTC' });

    await this.engine.raiseException({
      jobId: this.meta.id, domain: 'finance', companyId, severity: 'medium',
      title: 'الضريبة المستحقة — يجب تقديم الإقرار',
      description: `الضريبة عن ${monthName} ${prevMonthStart.getUTCFullYear()}: ${totalTax.toLocaleString('ar')} د.ع (إجمالي مبيعات: ${totalSales.toLocaleString('ar')} د.ع، ${invoices} فاتورة)`,
      suggestedAction: 'مراجعة الإقرار الضريبي وتقديمه في الموعد القانوني',
      payload: {
        month:          prevMonthStart.toISOString().slice(0, 7),
        totalTaxIqd:    totalTax,
        totalSalesIqd:  totalSales,
        invoiceCount:   invoices,
      },
    });

    return {
      status: 'exception_raised',
      itemsProcessed: invoices,
      exceptionsRaised: 1,
      details: { month: prevMonthStart.toISOString().slice(0, 7), totalTaxIqd: totalTax },
    };
  }
}