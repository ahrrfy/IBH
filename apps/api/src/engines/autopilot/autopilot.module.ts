import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../../platform/notifications/notifications.module';
import { ProcurementAutoReorderModule } from '../../modules/procurement/auto-reorder/auto-reorder.module';
import { AutopilotEngineService } from './autopilot.service';
import { AutopilotController } from './autopilot.controller';
// I047 — AutopilotProcessor + AutopilotScheduler classes excluded from
// providers below to bypass @nestjs/bull explorer double-registration.
// Cron jobs paused; engine still callable manually via /autopilot/run.
import { AUTOPILOT_QUEUE } from './autopilot.scheduler';
import { AUTOPILOT_JOBS } from './autopilot.tokens';
import { SalesOverdueReminderJob } from './jobs/sales.overdue-reminder.job';
import { InventoryAutoReorderJob } from './jobs/inventory.auto-reorder.job';
import { LicenseAutoRenewalJob } from './jobs/license.auto-renewal.job';
import { AutopilotJobScaffolds } from './jobs/stubs';
// ── T71 implemented jobs ────────────────────────────────────────────────────
import { CrmLeadScoringRefreshJob } from './jobs/crm.lead-scoring-refresh.job';
import { CrmFollowupReminderJob } from './jobs/crm.followup-reminder.job';
import { CrmSilentChurnAlertJob } from './jobs/crm.silent-churn-alert.job';
import { ProcurementVendorScorecardJob } from './jobs/procurement.vendor-scorecard.job';
import { ProcurementPriceDriftAlertJob } from './jobs/procurement.price-drift-alert.job';
import { SalesDailyRepSummaryJob } from './jobs/sales.daily-rep-summary.job';
import { SalesQuotationFollowupJob } from './jobs/sales.quotation-followup.job';
import { SalesChurnRiskFlagJob } from './jobs/sales.churn-risk-flag.job';
import { FinancePeriodCloseCheckJob } from './jobs/finance.period-close-check.job';
import { FinanceBankReconciliationJob } from './jobs/finance.bank-reconciliation.job';
import { FinanceBudgetVarianceScanJob } from './jobs/finance.budget-variance-scan.job';
import { FinanceDepreciationPostJob } from './jobs/finance.depreciation-post.job';
import { HrAttendanceAnomalyJob } from './jobs/hr.attendance-anomaly.job';
import { HrContractRenewalAlertJob } from './jobs/hr.contract-renewal-alert.job';
import { HrPayrollPrepareJob } from './jobs/hr.payroll-prepare.job';
import { HrLeaveBalanceRecomputeJob } from './jobs/hr.leave-balance-recompute.job';
import { InventoryExpiryWatcherJob } from './jobs/inventory.expiry-watcher.job';
import { InventoryDeadstockDetectJob } from './jobs/inventory.deadstock-detect.job';
import { InventoryTransferSuggestJob } from './jobs/inventory.transfer-suggest.job';
import { DeliveryCodSettlementJob } from './jobs/delivery.cod-settlement.job';
import { DeliveryFailedRedeliveryJob } from './jobs/delivery.failed-redelivery.job';
import { FinanceUnbalancedJeDetectJob } from './jobs/finance.unbalanced-je-detect.job';
import { HrBirthdayGreetingJob } from './jobs/hr.birthday-greeting.job';
import { HrProbationEndFlagJob } from './jobs/hr.probation-end-flag.job';
import { InventoryWarehouseBalanceJob } from './jobs/inventory.warehouse-balance.job';
import { InventoryBarcodeMissingJob } from './jobs/inventory.barcode-missing.job';
import { InventoryStocktakeReminderJob } from './jobs/inventory.stocktake-reminder.job';
// ── T71 — Batch 3 jobs ──────────────────────────────────────────────────────
import { SalesLoyaltyTierRecomputeJob } from './jobs/sales.loyalty-tier-recompute.job';
import { SalesCommissionCalcJob } from './jobs/sales.commission-calc.job';
import { FinanceExchangeRateSyncJob } from './jobs/finance.exchange-rate-sync.job';
import { LicenseHeartbeatCheckJob } from './jobs/license.heartbeat-check.job';
import { LicenseUsageReportJob } from './jobs/license.usage-report.job';
import { CrmDuplicateMergeSuggestJob } from './jobs/crm.duplicate-merge-suggest.job';
// ── T71 — Batch 4 jobs (final 14) ───────────────────────────────────────────
import { SalesPriceListRolloverJob } from './jobs/sales.price-list-rollover.job';
import { SalesDormantCustomerReviveJob } from './jobs/sales.dormant-customer-revive.job';
import { SalesTargetVsActualJob } from './jobs/sales.target-vs-actual.job';
import { SalesReturnPatternDetectJob } from './jobs/sales.return-pattern-detect.job';
import { SalesCrossSellSuggesterJob } from './jobs/sales.cross-sell-suggester.job';
import { InventoryCostRecalculateJob } from './jobs/inventory.cost-recalculate.job';
import { InventoryShelfLifeAlertJob } from './jobs/inventory.shelf-life-alert.job';
import { FinanceTaxLiabilityCalcJob } from './jobs/finance.tax-liability-calc.job';
import { FinanceCashflowForecastJob } from './jobs/finance.cashflow-forecast.job';
import { CrmNpsPulseJob } from './jobs/crm.nps-pulse.job';
import { DeliveryDriverLoadBalanceJob } from './jobs/delivery.driver-load-balance.job';
import { DeliveryEtaDeviationJob } from './jobs/delivery.eta-deviation.job';
import { DeliveryZoneCoverageAuditJob } from './jobs/delivery.zone-coverage-audit.job';
import { ProcurementThreeWayMatchJob } from './jobs/procurement.three-way-match.job';
import type { AutopilotJob } from './autopilot.types';

// ─── T71 — Autonomous Operations Engine Module ──────────────────────────────
// Brings together:
//   * The 3 reference jobs (sales.overdue-reminder, inventory.auto-reorder,
//     license.auto-renewal) — fully implemented.
//   * The 47 scaffolded jobs from `jobs/stubs.ts` — register their metadata
//     so the catalogue endpoint shows the full roadmap.
//   * The BullMQ scheduler + processor that ticks every cron-scheduled job.
//   * The manager-facing controller at `/autopilot/*`.
//
// Job providers attach to the AUTOPILOT_JOBS multi-token. The engine reads
// the resulting array in its constructor — adding a new job is a one-line
// change here once its class is implemented.

@Module({
  imports: [
    AuditModule,
    NotificationsModule,
    ProcurementAutoReorderModule,
    BullModule.registerQueue({ name: AUTOPILOT_QUEUE }),
  ],
  controllers: [AutopilotController],
  providers: [
    AutopilotEngineService,

    // Reference jobs.
    SalesOverdueReminderJob,
    InventoryAutoReorderJob,
    LicenseAutoRenewalJob,

    // T71 implemented jobs — CRM
    CrmLeadScoringRefreshJob,
    CrmFollowupReminderJob,
    CrmSilentChurnAlertJob,

    // T71 implemented jobs — Procurement
    ProcurementVendorScorecardJob,
    ProcurementPriceDriftAlertJob,

    // T71 implemented jobs — Sales extended
    SalesDailyRepSummaryJob,
    SalesQuotationFollowupJob,
    SalesChurnRiskFlagJob,

    // T71 implemented jobs — Finance
    FinancePeriodCloseCheckJob,
    FinanceBankReconciliationJob,
    FinanceBudgetVarianceScanJob,
    FinanceDepreciationPostJob,

    // T71 implemented jobs — HR
    HrAttendanceAnomalyJob,
    HrContractRenewalAlertJob,
    HrPayrollPrepareJob,
    HrLeaveBalanceRecomputeJob,

    // T71 implemented jobs — Inventory + Delivery
    InventoryExpiryWatcherJob,
    InventoryDeadstockDetectJob,
    InventoryTransferSuggestJob,
    DeliveryCodSettlementJob,
    DeliveryFailedRedeliveryJob,

    // T71 implemented jobs — Batch 2
    FinanceUnbalancedJeDetectJob,
    HrBirthdayGreetingJob,
    HrProbationEndFlagJob,
    InventoryWarehouseBalanceJob,
    InventoryBarcodeMissingJob,
    InventoryStocktakeReminderJob,

    // T71 implemented jobs — Batch 3
    SalesLoyaltyTierRecomputeJob,
    SalesCommissionCalcJob,
    FinanceExchangeRateSyncJob,
    LicenseHeartbeatCheckJob,
    LicenseUsageReportJob,
    CrmDuplicateMergeSuggestJob,

    // T71 implemented jobs — Batch 4 (final 14)
    SalesPriceListRolloverJob,
    SalesDormantCustomerReviveJob,
    SalesTargetVsActualJob,
    SalesReturnPatternDetectJob,
    SalesCrossSellSuggesterJob,
    InventoryCostRecalculateJob,
    InventoryShelfLifeAlertJob,
    FinanceTaxLiabilityCalcJob,
    FinanceCashflowForecastJob,
    CrmNpsPulseJob,
    DeliveryDriverLoadBalanceJob,
    DeliveryEtaDeviationJob,
    DeliveryZoneCoverageAuditJob,
    ProcurementThreeWayMatchJob,

    // Scaffold builder (remaining stubs — none).
    AutopilotJobScaffolds,

    // Multi-collection of every AutopilotJob — one provider per registration.
    {
      provide: AUTOPILOT_JOBS,
      useFactory: (
        salesOverdue: SalesOverdueReminderJob,
        inventory: InventoryAutoReorderJob,
        license: LicenseAutoRenewalJob,
        crmScoring: CrmLeadScoringRefreshJob,
        crmFollowup: CrmFollowupReminderJob,
        crmChurn: CrmSilentChurnAlertJob,
        procScorecard: ProcurementVendorScorecardJob,
        procDrift: ProcurementPriceDriftAlertJob,
        salesRepSummary: SalesDailyRepSummaryJob,
        salesQuotation: SalesQuotationFollowupJob,
        salesChurnRisk: SalesChurnRiskFlagJob,
        finPeriodClose: FinancePeriodCloseCheckJob,
        finBankRecon: FinanceBankReconciliationJob,
        finBudgetVariance: FinanceBudgetVarianceScanJob,
        finDepreciation: FinanceDepreciationPostJob,
        hrAttendance: HrAttendanceAnomalyJob,
        hrContractRenewal: HrContractRenewalAlertJob,
        hrPayroll: HrPayrollPrepareJob,
        hrLeaveBalance: HrLeaveBalanceRecomputeJob,
        invExpiry: InventoryExpiryWatcherJob,
        invDeadstock: InventoryDeadstockDetectJob,
        invTransfer: InventoryTransferSuggestJob,
        deliveryCod: DeliveryCodSettlementJob,
        deliveryRedeliver: DeliveryFailedRedeliveryJob,
        finUnbalancedJe: FinanceUnbalancedJeDetectJob,
        hrBirthday: HrBirthdayGreetingJob,
        hrProbation: HrProbationEndFlagJob,
        invWarehouseBalance: InventoryWarehouseBalanceJob,
        invBarcodesMissing: InventoryBarcodeMissingJob,
        invStocktake: InventoryStocktakeReminderJob,
        salesLoyaltyTier: SalesLoyaltyTierRecomputeJob,
        salesCommission: SalesCommissionCalcJob,
        finExchangeRate: FinanceExchangeRateSyncJob,
        licHeartbeat: LicenseHeartbeatCheckJob,
        licUsageReport: LicenseUsageReportJob,
        crmDupMerge: CrmDuplicateMergeSuggestJob,
        salesPriceRollover: SalesPriceListRolloverJob,
        salesDormant: SalesDormantCustomerReviveJob,
        salesTargetActual: SalesTargetVsActualJob,
        salesReturnPattern: SalesReturnPatternDetectJob,
        salesCrossSell: SalesCrossSellSuggesterJob,
        invCostRecalc: InventoryCostRecalculateJob,
        invShelfLife: InventoryShelfLifeAlertJob,
        finTaxLiability: FinanceTaxLiabilityCalcJob,
        finCashflow: FinanceCashflowForecastJob,
        crmNps: CrmNpsPulseJob,
        delDriverLoad: DeliveryDriverLoadBalanceJob,
        delEta: DeliveryEtaDeviationJob,
        delZoneCoverage: DeliveryZoneCoverageAuditJob,
        procThreeWay: ProcurementThreeWayMatchJob,
        scaffolds: AutopilotJobScaffolds,
      ): AutopilotJob[] => [
        salesOverdue,
        inventory,
        license,
        crmScoring,
        crmFollowup,
        crmChurn,
        procScorecard,
        procDrift,
        salesRepSummary,
        salesQuotation,
        salesChurnRisk,
        finPeriodClose, finBankRecon, finBudgetVariance, finDepreciation,
        hrAttendance, hrContractRenewal, hrPayroll, hrLeaveBalance,
        invExpiry, invDeadstock, invTransfer,
        deliveryCod, deliveryRedeliver,
        finUnbalancedJe, hrBirthday, hrProbation,
        invWarehouseBalance, invBarcodesMissing, invStocktake,
        salesLoyaltyTier, salesCommission, finExchangeRate,
        licHeartbeat, licUsageReport, crmDupMerge,
        salesPriceRollover, salesDormant, salesTargetActual,
        salesReturnPattern, salesCrossSell,
        invCostRecalc, invShelfLife,
        finTaxLiability, finCashflow,
        crmNps,
        delDriverLoad, delEta, delZoneCoverage,
        procThreeWay,
        ...scaffolds.buildAll(),
      ],
      inject: [
        SalesOverdueReminderJob,
        InventoryAutoReorderJob,
        LicenseAutoRenewalJob,
        CrmLeadScoringRefreshJob,
        CrmFollowupReminderJob,
        CrmSilentChurnAlertJob,
        ProcurementVendorScorecardJob,
        ProcurementPriceDriftAlertJob,
        SalesDailyRepSummaryJob,
        SalesQuotationFollowupJob,
        SalesChurnRiskFlagJob,
        FinancePeriodCloseCheckJob,
        FinanceBankReconciliationJob,
        FinanceBudgetVarianceScanJob,
        FinanceDepreciationPostJob,
        HrAttendanceAnomalyJob,
        HrContractRenewalAlertJob,
        HrPayrollPrepareJob,
        HrLeaveBalanceRecomputeJob,
        InventoryExpiryWatcherJob,
        InventoryDeadstockDetectJob,
        InventoryTransferSuggestJob,
        DeliveryCodSettlementJob,
        DeliveryFailedRedeliveryJob,
        FinanceUnbalancedJeDetectJob,
        HrBirthdayGreetingJob,
        HrProbationEndFlagJob,
        InventoryWarehouseBalanceJob,
        InventoryBarcodeMissingJob,
        InventoryStocktakeReminderJob,
        SalesLoyaltyTierRecomputeJob,
        SalesCommissionCalcJob,
        FinanceExchangeRateSyncJob,
        LicenseHeartbeatCheckJob,
        LicenseUsageReportJob,
        CrmDuplicateMergeSuggestJob,
        SalesPriceListRolloverJob,
        SalesDormantCustomerReviveJob,
        SalesTargetVsActualJob,
        SalesReturnPatternDetectJob,
        SalesCrossSellSuggesterJob,
        InventoryCostRecalculateJob,
        InventoryShelfLifeAlertJob,
        FinanceTaxLiabilityCalcJob,
        FinanceCashflowForecastJob,
        CrmNpsPulseJob,
        DeliveryDriverLoadBalanceJob,
        DeliveryEtaDeviationJob,
        DeliveryZoneCoverageAuditJob,
        ProcurementThreeWayMatchJob,
        AutopilotJobScaffolds,
      ],
    },
  ],
  exports: [AutopilotEngineService],
})
export class AutopilotModule {}
