import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: procurement.vendor-scorecard ───────────────────────────────────
// Cron: 07:00 UTC Mondays.
// Goal: Recompute supplier performance scores using the last 90 days of GRN
// data and raise a warning exception for any supplier whose score drops
// below 60%.
//
// Scoring formula (equal thirds → final 0-100 score):
//   1. On-time delivery rate  = GRNs where receiptDate ≤ PO.expectedDate  / total GRNs
//   2. Quality acceptance rate = SUM(grnLine.qtyAccepted) / SUM(grnLine.qtyReceived)
//   3. Invoice accuracy rate   = VendorInvoice lines within 2% of PO line unitCostIqd
//
// We update Supplier.onTimeDeliveryPct and Supplier.qualityScorePct (existing
// fields).  There is no separate performanceScore column — the composite score
// is computed here and stored in qualityScorePct as a combined proxy until a
// dedicated column is added via migration.
//
// Suppliers with no GRNs in the window are skipped (not penalised).

const SCORECARD_WINDOW_DAYS = 90;
const POOR_PERFORMANCE_THRESHOLD = 60; // percent
const INVOICE_PRICE_TOLERANCE_PCT = 2; // 2% allowed deviation

@Injectable()
export class ProcurementVendorScorecardJob implements AutopilotJob {
  private readonly logger = new Logger(ProcurementVendorScorecardJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'procurement.vendor-scorecard',
    domain: 'procurement',
    schedule: '0 7 * * 1',
    companyScoped: true,
    titleAr: 'بطاقة أداء الموردين',
    titleEn: 'Vendor Scorecard',
    description:
      'Monday 07:00 sweep — recomputes supplier performance scores from the ' +
      'last 90 days of GRN data and flags suppliers below 60%.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const windowStart = new Date(
      Date.now() - SCORECARD_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    // Fetch all active suppliers for this company.
    const suppliers = await this.prisma.supplier.findMany({
      where: {
        companyId: ctx.companyId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, nameAr: true },
    });

    let itemsProcessed = 0;
    let exceptionsRaised = 0;

    for (const supplier of suppliers) {
      // Load GRNs within the window for this supplier.
      const grns = await this.prisma.goodsReceiptNote.findMany({
        where: {
          companyId: ctx.companyId,
          supplierId: supplier.id,
          receiptDate: { gte: windowStart },
          status: 'accepted',
        },
        select: {
          id: true,
          receiptDate: true,
          purchaseOrder: { select: { expectedDate: true } },
          lines: {
            select: {
              qtyReceived: true,
              qtyAccepted: true,
            },
          },
        },
      });

      if (grns.length === 0) continue; // no GRN data — skip supplier

      // 1. On-time delivery rate
      const onTimeCount = grns.filter((grn) => {
        const expected = grn.purchaseOrder.expectedDate;
        if (!expected) return true; // no expected date → count as on-time
        return grn.receiptDate <= expected;
      }).length;
      const onTimeRate = (onTimeCount / grns.length) * 100;

      // 2. Quality acceptance rate across all GRN lines
      let totalReceived = 0;
      let totalAccepted = 0;
      for (const grn of grns) {
        for (const line of grn.lines) {
          totalReceived += Number(line.qtyReceived);
          totalAccepted += Number(line.qtyAccepted);
        }
      }
      const qualityRate =
        totalReceived > 0 ? (totalAccepted / totalReceived) * 100 : 100;

      // 3. Invoice accuracy rate — compare vendor invoice lines vs PO lines
      const invoices = await this.prisma.vendorInvoice.findMany({
        where: {
          companyId: ctx.companyId,
          supplierId: supplier.id,
          invoiceDate: { gte: windowStart },
          status: { notIn: ['cancelled'] },
          purchaseOrderId: { not: null },
        },
        select: {
          lines: { select: { unitCostIqd: true, variantId: true } },
          purchaseOrder: {
            select: {
              lines: { select: { unitCostIqd: true, variantId: true } },
            },
          },
        },
      });

      let accurateLines = 0;
      let totalLines = 0;
      for (const inv of invoices) {
        const poLineMap = new Map(
          (inv.purchaseOrder?.lines ?? []).map((l) => [l.variantId, Number(l.unitCostIqd)]),
        );
        for (const line of inv.lines) {
          if (!line.variantId) continue;
          const poPrice = poLineMap.get(line.variantId);
          if (poPrice === undefined || poPrice === 0) continue;
          totalLines++;
          const diff = Math.abs(Number(line.unitCostIqd) - poPrice) / poPrice * 100;
          if (diff <= INVOICE_PRICE_TOLERANCE_PCT) accurateLines++;
        }
      }
      const invoiceAccuracyRate =
        totalLines > 0 ? (accurateLines / totalLines) * 100 : 100;

      // Composite score: equal thirds
      const compositeScore = Math.round(
        (onTimeRate + qualityRate + invoiceAccuracyRate) / 3,
      );

      // Persist updated metrics on the Supplier record.
      try {
        await this.prisma.supplier.update({
          where: { id: supplier.id },
          data: {
            onTimeDeliveryPct: onTimeRate,
            qualityScorePct: compositeScore, // stored as combined proxy
          },
        });
        itemsProcessed++;
      } catch (err) {
        this.logger.warn(
          `[procurement.vendor-scorecard] update failed for supplier=${supplier.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        continue;
      }

      // Raise warning if performance is poor.
      if (compositeScore < POOR_PERFORMANCE_THRESHOLD) {
        try {
          await this.engine.raiseException({
            jobId: this.meta.id,
            domain: 'procurement',
            companyId: ctx.companyId,
            severity: 'medium',
            title: `أداء ضعيف — مورد ${supplier.nameAr}`,
            description:
              `مورد ${supplier.nameAr} — أداء ضعيف ${compositeScore}%` +
              ` (تسليم في الوقت: ${onTimeRate.toFixed(0)}%` +
              `, جودة: ${qualityRate.toFixed(0)}%` +
              `, دقة الفاتورة: ${invoiceAccuracyRate.toFixed(0)}%)`,
            suggestedAction:
              'مراجعة عقد التوريد وفتح نقاش مع المورد لتحسين الأداء',
            payload: {
              supplierId: supplier.id,
              supplierName: supplier.nameAr,
              compositeScore,
              onTimeDeliveryPct: onTimeRate,
              qualityAcceptancePct: qualityRate,
              invoiceAccuracyPct: invoiceAccuracyRate,
              grnCount: grns.length,
            },
          });
          exceptionsRaised++;
        } catch (err) {
          this.logger.warn(
            `[procurement.vendor-scorecard] raiseException failed for supplier=${supplier.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    this.logger.log(
      `[procurement.vendor-scorecard] company=${ctx.companyId} — scored ${itemsProcessed} suppliers, ${exceptionsRaised} warnings raised`,
    );

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'completed',
      itemsProcessed,
      exceptionsRaised,
      details: { suppliersEvaluated: itemsProcessed, warnings: exceptionsRaised },
    };
  }
}
