import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

const QTY_TOLERANCE_PCT = 0.05; // 5%

/**
 * Daily 04:00 — 3-way match (PO + GRN + VendorInvoice).
 * Flags POs that have an accepted GRN but no linked vendor invoice,
 * or where received qty deviates from ordered qty by > 5%.
 */
@Injectable()
export class ProcurementThreeWayMatchJob implements AutopilotJob {
  private readonly logger = new Logger(ProcurementThreeWayMatchJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'procurement.three-way-match',
    domain: 'procurement',
    schedule: '0 4 * * *',
    companyScoped: true,
    titleAr: 'المطابقة الثلاثية التلقائية (PO-GRN-Invoice)',
    titleEn: 'Three-way Match',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { companyId } = ctx;
    let exceptionsRaised = 0;

    let pos: Array<{
      id: string;
      number: string;
      grns: Array<{ id: string; status: string }>;
      vendorInvoices: Array<{ id: string }>;
      lines: Array<{ variantId: string; qtyOrdered: unknown; qtyReceived: unknown }>;
    }> = [];

    try {
      pos = await this.prisma.purchaseOrder.findMany({
        where: {
          companyId,
          status: { in: ['approved', 'partially_received', 'received'] as any[] },
          grns: { some: { status: { in: ['accepted', 'partially_accepted'] as any[] } } },
        },
        include: {
          grns:           { select: { id: true, status: true } },
          vendorInvoices: { select: { id: true } },
          lines:          { select: { variantId: true, qtyOrdered: true, qtyReceived: true } },
        },
        take: 100,
      });
    } catch (err) {
      this.logger.error(`[${this.meta.id}] ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'failed', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    for (const po of pos) {
      const hasInvoice = po.vendorInvoices.length > 0;
      const hasAcceptedGrn = po.grns.some(
        (g) => g.status === 'accepted' || g.status === 'partially_accepted',
      );

      // GRN received but no vendor invoice
      if (hasAcceptedGrn && !hasInvoice) {
        await this.engine.raiseException({
          jobId: this.meta.id, domain: 'procurement', companyId, severity: 'medium',
          title: 'مطابقة ثلاثية ناقصة — لا فاتورة مورد',
          description: `أمر شراء #${po.number}: تمّ استلام البضاعة لكن لا توجد فاتورة مورد مرتبطة`,
          suggestedAction: 'إدخال فاتورة المورد وربطها بأمر الشراء',
          payload: { purchaseOrderId: po.id },
        });
        exceptionsRaised++;
        continue;
      }

      // Qty discrepancy > 5%
      for (const line of po.lines) {
        const ordered  = Number(line.qtyOrdered);
        const received = Number(line.qtyReceived);
        if (ordered > 0) {
          const diff = Math.abs(received - ordered) / ordered;
          if (diff > QTY_TOLERANCE_PCT) {
            await this.engine.raiseException({
              jobId: this.meta.id, domain: 'procurement', companyId,
              severity: diff > 0.20 ? 'high' : 'medium',
              title: 'فرق كمية في المطابقة الثلاثية',
              description: `PO #${po.number}: الكمية المستلمة ${received} تختلف عن المطلوبة ${ordered} بنسبة ${(diff * 100).toFixed(1)}%`,
              suggestedAction: 'مراجعة GRN وإصدار أمر شراء تكميلي أو تعديل الفاتورة',
              payload: { purchaseOrderId: po.id, variantId: line.variantId, ordered, received, diffPct: diff },
            });
            exceptionsRaised++;
          }
        }
      }
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: pos.length,
      exceptionsRaised,
      details: { posChecked: pos.length, mismatches: exceptionsRaised },
    };
  }
}