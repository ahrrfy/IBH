import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
  AutopilotSeverity,
} from '../autopilot.types';

// ─── T71 Job: hr.contract-renewal-alert ─────────────────────────────────────
// Cron: 08:00 UTC daily.
// Goal: flag active/signed employment contracts expiring within 30 days.
// Severity tiers based on days remaining until endDate:
//   <= 7 days  → critical
//   <= 14 days → warning
//   <= 30 days → info
// Only contracts with status 'active' are alerted (excludes draft/expired/terminated).

/** Maximum lookahead in days for contract renewal alerts. */
const LOOKAHEAD_DAYS = 30;

/** Maps days-remaining to a severity level. */
function resolveSeverity(daysLeft: number): AutopilotSeverity {
  if (daysLeft <= 7) return 'critical';
  if (daysLeft <= 14) return 'warning';
  return 'low';
}

@Injectable()
export class HrContractRenewalAlertJob implements AutopilotJob {
  private readonly logger = new Logger(HrContractRenewalAlertJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'hr.contract-renewal-alert',
    domain: 'hr',
    schedule: '0 8 * * *',
    companyScoped: true,
    titleAr: 'تنبيه تجديد العقود',
    titleEn: 'Contract Renewal Alert',
    description:
      'Daily 08:00 scan — raises exceptions for active employment contracts expiring within 30 days.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  /**
   * Execute the contract renewal check for a single company.
   *
   * Business rule:
   *   EmploymentContract rows with status='active' AND endDate IS NOT NULL
   *   AND endDate BETWEEN NOW() AND NOW() + 30 days → raise an exception
   *   per contract, severity based on days remaining.
   *
   * @param ctx - Job context including companyId.
   * @returns AutopilotJobResult with itemsProcessed = number of expiring contracts found.
   */
  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const cutoff = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

    let expiringContracts: Array<{
      id: string;
      contractNo: string;
      endDate: Date | null;
      employeeId: string;
    }> = [];

    try {
      expiringContracts = await this.prisma.employmentContract.findMany({
        where: {
          companyId: ctx.companyId,
          status: 'active',
          endDate: {
            not: null,
            gte: now,
            lte: cutoff,
          },
        },
        select: {
          id: true,
          contractNo: true,
          endDate: true,
          employeeId: true,
        },
        orderBy: { endDate: 'asc' },
        take: 200,
      });
    } catch (err) {
      this.logger.error(
        `[hr.contract-renewal-alert] Failed to query contracts for company=${ctx.companyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    if (expiringContracts.length === 0) {
      return { status: 'completed', itemsProcessed: 0, exceptionsRaised: 0 };
    }

    // Fetch employee names in one query for efficiency.
    const employeeIds = expiringContracts.map((c) => c.employeeId);
    let employeeMap = new Map<string, string>();

    try {
      const employees = await this.prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, nameAr: true },
      });
      for (const e of employees) {
        employeeMap.set(e.id, e.nameAr);
      }
    } catch (err) {
      this.logger.warn(
        `[hr.contract-renewal-alert] Could not fetch employee names: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    let exceptionsRaised = 0;

    for (const contract of expiringContracts) {
      if (!contract.endDate) continue;

      const daysLeft = Math.max(
        0,
        Math.ceil((contract.endDate.getTime() - now.getTime()) / 86_400_000),
      );
      const severity = resolveSeverity(daysLeft);
      const employeeName = employeeMap.get(contract.employeeId) ?? contract.employeeId;

      try {
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'hr',
          companyId: ctx.companyId,
          severity,
          title: `عقد ${employeeName} ينتهي خلال ${daysLeft} يوم`,
          description: `عقد العمل رقم ${contract.contractNo} للموظف ${employeeName} ينتهي بتاريخ ${
            contract.endDate.toISOString().split('T')[0]
          } (متبقي ${daysLeft} يوم)`,
          suggestedAction: 'مراجعة العقد وتجديده أو إنهاء العلاقة الوظيفية رسمياً',
          payload: {
            contractId: contract.id,
            contractNo: contract.contractNo,
            employeeId: contract.employeeId,
            employeeName,
            endDate: contract.endDate.toISOString().split('T')[0],
            daysLeft,
          },
        });
        exceptionsRaised++;
      } catch (err) {
        this.logger.error(
          `[hr.contract-renewal-alert] Failed to raise exception for contract=${contract.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'completed',
      itemsProcessed: expiringContracts.length,
      exceptionsRaised,
      details: {
        lookaheadDays: LOOKAHEAD_DAYS,
        expiringCount: expiringContracts.length,
      },
    };
  }
}
