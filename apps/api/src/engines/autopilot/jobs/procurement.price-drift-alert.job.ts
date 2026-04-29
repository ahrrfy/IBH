import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: procurement.price-drift-alert ──────────────────────────────────
// Cron: 08:00 UTC daily.
// Goal: Alert procurement managers when a vendor invoice line's unit cost
// deviates by more than 5% from the matched PO line's unit cost.
//
// Scope: VendorInvoices in status 'draft' or 'pending' created in the last 7
// days (recently received, not yet reviewed).  Only invoices linked to a
// PurchaseOrder are analysed — stand-alone invoices lack a price benchmark.
//
// One exception is raised per offending invoice (not per line) to avoid noise.
// The exception payload includes the worst drift percentage and the invoice ref.

const PRICE_DRIFT_THRESHOLD_PCT = 5;
const REVIEW_WINDOW_DAYS = 7;
const REVIEWABLE_STATUSES = ['draft', 'pending'];

@Injectable()
export class ProcurementPriceDriftAlertJob implements AutopilotJob {
  private readonly logger = new Logger(ProcurementPriceDriftAlertJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'procurement.price-drift-alert',
    domain: 'procurement',
    schedule: '0 8 * * *',
    companyScoped: true,
    titleAr: 'تنبيه ارتفاع أسعار المورد',
    titleEn: 'Price Drift Alert',
    description:
      'Daily 08:00 sweep — flags vendor invoices where any line unit price ' +
      'differs from the linked PO price by more than 5%.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const windowStart = new Date(
      Date.now() - REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    // Fetch recent unreviewed vendor invoices that are linked to a PO.
    const invoices = await this.prisma.vendorInvoice.findMany({
      where: {
        companyId: ctx.companyId,
        status: { in: REVIEWABLE_STATUSES as any[] },
        createdAt: { gte: windowStart },
        purchaseOrderId: { not: null },
      },
      select: {
        id: true,
        number: true,
        vendorRef: true,
        supplier: { select: { nameAr: true } },
        lines: {
          select: {
            id: true,
            variantId: true,
            unitCostIqd: true,
          },
        },
        purchaseOrder: {
          select: {
            lines: {
              select: {
                variantId: true,
                unitCostIqd: true,
              },
            },
          },
        },
      },
      take: 500,
    });

    let itemsProcessed = 0;
    let exceptionsRaised = 0;

    for (const invoice of invoices) {
      if (!invoice.purchaseOrder) continue;
      itemsProcessed++;

      // Build a map: variantId → PO unit cost
      const poPriceMap = new Map<string, number>(
        invoice.purchaseOrder.lines
          .filter((l): l is typeof l & { variantId: string } => l.variantId !== null)
          .map((l) => [l.variantId, Number(l.unitCostIqd)]),
      );

      // Find the maximum price drift across all invoice lines
      let maxDriftPct = 0;
      let maxDriftVariantId: string | null = null;

      for (const line of invoice.lines) {
        if (!line.variantId) continue;
        const poPrice = poPriceMap.get(line.variantId);
        if (poPrice === undefined || poPrice === 0) continue;

        const invoicePrice = Number(line.unitCostIqd);
        const driftPct = Math.abs((invoicePrice - poPrice) / poPrice) * 100;

        if (driftPct > maxDriftPct) {
          maxDriftPct = driftPct;
          maxDriftVariantId = line.variantId;
        }
      }

      // Raise a warning exception if any line exceeds the threshold.
      if (maxDriftPct > PRICE_DRIFT_THRESHOLD_PCT) {
        try {
          await this.engine.raiseException({
            jobId: this.meta.id,
            domain: 'procurement',
            companyId: ctx.companyId,
            severity: 'medium',
            title: `انحراف سعري — فاتورة ${invoice.number}`,
            description:
              `فاتورة مورد ${invoice.number} (${invoice.supplier.nameAr}) — ` +
              `انحراف سعري ${maxDriftPct.toFixed(1)}% عن أمر الشراء`,
            suggestedAction:
              'مراجعة بنود الفاتورة مع المورد قبل الاعتماد',
            payload: {
              invoiceId: invoice.id,
              invoiceNumber: invoice.number,
              vendorRef: invoice.vendorRef,
              supplierName: invoice.supplier.nameAr,
              maxDriftPct: Math.round(maxDriftPct * 100) / 100,
              worstVariantId: maxDriftVariantId,
            },
          });
          exceptionsRaised++;
        } catch (err) {
          this.logger.warn(
            `[procurement.price-drift-alert] raiseException failed for invoice=${invoice.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    this.logger.log(
      `[procurement.price-drift-alert] company=${ctx.companyId} — checked ${itemsProcessed} invoices, ${exceptionsRaised} drift alerts raised`,
    );

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'completed',
      itemsProcessed,
      exceptionsRaised,
      details: {
        invoicesChecked: itemsProcessed,
        driftAlertsRaised: exceptionsRaised,
      },
    };
  }
}
