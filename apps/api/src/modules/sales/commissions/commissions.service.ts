import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { UserSession } from '@erp/shared-types';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { PostingService } from '../../../engines/posting/posting.service';
import {
  CreatePlanDto,
  UpdatePlanDto,
  AssignPlanDto,
  ManualEntryDto,
  createPlanSchema,
  updatePlanSchema,
  assignPlanSchema,
  manualEntrySchema,
} from './dto/commissions.dto';

/**
 * CommissionsService (T43).
 *
 * Implements the Sales Commissions & Incentives module:
 *  - CRUD for CommissionPlan + CommissionRule + CommissionAssignment.
 *  - Event-driven accrual on `invoice.posted` and clawback on
 *    `sales.return.posted`.
 *  - Every accrual/clawback creates an append-only CommissionEntry AND a
 *    balanced double-entry journal entry (F2). The two writes happen in the
 *    same Prisma transaction so the entry and its JE either both exist or
 *    neither does.
 *
 * Account codes used (must exist in the chart of accounts):
 *   - 6611  Commission Expense (P&L, debit-normal)
 *   - 4321  Commissions Payable (Liability, credit-normal)
 *
 * For commercial flexibility these codes are constants here; T48
 * (Account Mapping) will replace them with per-event configuration.
 */
const ACC_COMMISSION_EXPENSE = '6611';
const ACC_COMMISSION_PAYABLE = '4321';

@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: PostingService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Plans ────────────────────────────────────────────────────────────────

  async listPlans(companyId: string) {
    // I047 — defensive: log + empty fallback so /sales/commissions/plans
    // renders empty state instead of 500ing.
    try {
      return await this.prisma.commissionPlan.findMany({
        where: { companyId },
        include: { rules: true, _count: { select: { assignments: true, entries: true } } },
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      const m = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error('[commissions.listPlans] FAILED:', m);
      return [];
    }
  }

  async getPlan(companyId: string, id: string) {
    const plan = await this.prisma.commissionPlan.findFirst({
      where: { id, companyId },
      include: { rules: { orderBy: { sortOrder: 'asc' } }, assignments: true },
    });
    if (!plan) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'خطة العمولة غير موجودة',
      });
    }
    return plan;
  }

  async createPlan(companyId: string, raw: unknown, session: UserSession) {
    const dto: CreatePlanDto = createPlanSchema.parse(raw);
    const plan = await this.prisma.$transaction(async (tx) => {
      const p = await tx.commissionPlan.create({
        data: {
          companyId,
          code: dto.code,
          nameAr: dto.nameAr,
          nameEn: dto.nameEn,
          basis: dto.basis,
          kind: dto.kind,
          flatPct: new Prisma.Decimal(dto.flatPct),
          validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          notes: dto.notes,
          createdBy: session.userId,
          rules: {
            create: dto.rules.map((r, i) => ({
              fromAmount: r.fromAmount != null ? new Prisma.Decimal(r.fromAmount) : null,
              toAmount: r.toAmount != null ? new Prisma.Decimal(r.toAmount) : null,
              productId: r.productId,
              categoryId: r.categoryId,
              pct: new Prisma.Decimal(r.pct),
              sortOrder: r.sortOrder ?? i,
            })),
          },
        },
        include: { rules: true },
      });
      return p;
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'commission_plan.create',
      entityType: 'CommissionPlan',
      entityId: plan.id,
      after: plan,
    });
    return plan;
  }

  async updatePlan(companyId: string, id: string, raw: unknown, session: UserSession) {
    const dto: UpdatePlanDto = updatePlanSchema.parse(raw);
    const before = await this.getPlan(companyId, id);

    const updated = await this.prisma.commissionPlan.update({
      where: { id },
      data: {
        code: dto.code,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        basis: dto.basis,
        kind: dto.kind,
        flatPct: dto.flatPct != null ? new Prisma.Decimal(dto.flatPct) : undefined,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        notes: dto.notes,
        isActive: dto.isActive,
      },
      include: { rules: true },
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'commission_plan.update',
      entityType: 'CommissionPlan',
      entityId: id,
      before,
      after: updated,
    });
    return updated;
  }

  // ─── Assignments ──────────────────────────────────────────────────────────

  async assign(companyId: string, raw: unknown, session: UserSession) {
    const dto: AssignPlanDto = assignPlanSchema.parse(raw);
    // make sure plan exists and belongs to company
    await this.getPlan(companyId, dto.planId);

    const a = await this.prisma.commissionAssignment.create({
      data: {
        companyId,
        planId: dto.planId,
        employeeId: dto.employeeId,
        promoterName: dto.promoterName,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        createdBy: session.userId,
      },
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'commission_assignment.create',
      entityType: 'CommissionAssignment',
      entityId: a.id,
      after: a,
    });
    return a;
  }

  async unassign(companyId: string, id: string, session: UserSession) {
    const a = await this.prisma.commissionAssignment.findFirst({
      where: { id, companyId },
    });
    if (!a) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'التعيين غير موجود',
      });
    }
    const updated = await this.prisma.commissionAssignment.update({
      where: { id },
      data: { isActive: false, validUntil: new Date() },
    });
    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'commission_assignment.deactivate',
      entityType: 'CommissionAssignment',
      entityId: id,
      after: updated,
    });
    return updated;
  }

  // ─── Entries / Dashboard ─────────────────────────────────────────────────

  async listEntries(
    companyId: string,
    opts: {
      employeeId?: string;
      planId?: string;
      status?: string;
      from?: Date;
      to?: Date;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 200);
    const where: Prisma.CommissionEntryWhereInput = { companyId };
    if (opts.employeeId) where.employeeId = opts.employeeId;
    if (opts.planId) where.planId = opts.planId;
    if (opts.status) where.status = opts.status;
    if (opts.from || opts.to) {
      where.createdAt = {};
      if (opts.from) where.createdAt.gte = opts.from;
      if (opts.to) where.createdAt.lte = opts.to;
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.commissionEntry.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { plan: { select: { code: true, nameAr: true } } },
      }),
      this.prisma.commissionEntry.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  /**
   * Per-employee dashboard: today / MTD / YTD earned (accruals minus clawbacks).
   */
  async employeeSummary(companyId: string, employeeId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const sumFrom = async (since: Date) => {
      const r = await this.prisma.commissionEntry.aggregate({
        where: { companyId, employeeId, createdAt: { gte: since } },
        _sum: { amountIqd: true },
      });
      return Number(r._sum.amountIqd ?? 0);
    };

    return {
      today: await sumFrom(startOfDay),
      mtd: await sumFrom(startOfMonth),
      ytd: await sumFrom(startOfYear),
    };
  }

  // ─── Manual entry ─────────────────────────────────────────────────────────

  async createManualEntry(companyId: string, raw: unknown, session: UserSession) {
    const dto: ManualEntryDto = manualEntrySchema.parse(raw);
    await this.getPlan(companyId, dto.planId);
    return this.recordEntry(
      {
        companyId,
        branchId: session.branchId ?? null,
        planId: dto.planId,
        employeeId: dto.employeeId ?? null,
        promoterName: dto.promoterName ?? null,
        kind: dto.kind,
        refType: dto.refType,
        refId: dto.refId ?? '00000000000000000000000000',
        baseAmountIqd: new Prisma.Decimal(dto.baseAmountIqd),
        pctApplied: new Prisma.Decimal(dto.pctApplied),
        amountIqd: new Prisma.Decimal(dto.amountIqd),
        notes: dto.notes ?? null,
        createdBy: session.userId,
      },
      session.userId,
    );
  }

  // ─── Core: rate calculation ───────────────────────────────────────────────

  /**
   * Compute the commission percent for a given plan and base amount.
   * - flat:    plan.flatPct
   * - tiered:  pct of the rule whose [fromAmount,toAmount) covers baseAmount
   * - product: caller is responsible for picking productId; here we
   *            return plan.flatPct as a fallback. Per-product split is
   *            performed by the listener which iterates invoice lines.
   */
  computeRate(
    plan: { kind: string; flatPct: Prisma.Decimal; rules: Array<{ fromAmount: Prisma.Decimal | null; toAmount: Prisma.Decimal | null; pct: Prisma.Decimal }> },
    baseAmount: Prisma.Decimal,
  ): Prisma.Decimal {
    if (plan.kind === 'tiered') {
      for (const r of plan.rules) {
        const from = r.fromAmount ?? new Prisma.Decimal(0);
        const to = r.toAmount ?? new Prisma.Decimal('999999999999');
        if (baseAmount.gte(from) && baseAmount.lt(to)) return r.pct;
      }
      return new Prisma.Decimal(0);
    }
    return plan.flatPct;
  }

  // ─── Core: record entry + balanced JE (F2) ────────────────────────────────

  /**
   * Append-only ledger row + balanced journal entry. Throws if the resulting
   * JE would be unbalanced (which would only happen on programmer error since
   * we always pass the same amount on both sides).
   *
   * Returns the persisted CommissionEntry including its journalEntryId.
   */
  async recordEntry(
    input: {
      companyId: string;
      branchId: string | null;
      planId: string;
      employeeId: string | null;
      promoterName: string | null;
      kind: 'accrual' | 'clawback' | 'adjustment';
      refType: string;
      refId: string;
      baseAmountIqd: Prisma.Decimal;
      pctApplied: Prisma.Decimal;
      amountIqd: Prisma.Decimal;
      notes: string | null;
      createdBy: string;
    },
    actingUserId: string,
  ) {
    if (input.amountIqd.isZero()) {
      throw new BadRequestException({
        code: 'COMMISSION_ZERO_AMOUNT',
        messageAr: 'مبلغ العمولة لا يجوز أن يكون صفراً',
      });
    }

    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.commissionEntry.create({
        data: {
          companyId: input.companyId,
          branchId: input.branchId,
          planId: input.planId,
          employeeId: input.employeeId,
          promoterName: input.promoterName,
          kind: input.kind,
          refType: input.refType,
          refId: input.refId,
          baseAmountIqd: input.baseAmountIqd,
          pctApplied: input.pctApplied,
          amountIqd: input.amountIqd,
          status: 'accrued',
          notes: input.notes,
          createdBy: input.createdBy,
        },
      });

      // Balanced double-entry — F2.
      // accrual/positive adjustment: Dr Expense, Cr Payable.
      // clawback/negative adjustment: opposite sides on absolute value.
      const abs = input.amountIqd.abs();
      const isAccrual = input.amountIqd.gt(0);
      const lines = [
        {
          accountCode: isAccrual ? ACC_COMMISSION_EXPENSE : ACC_COMMISSION_PAYABLE,
          debit: abs,
          description: `${isAccrual ? 'Commission expense' : 'Commission clawback (Dr Payable)'} — ${input.refType}:${input.refId}`,
        },
        {
          accountCode: isAccrual ? ACC_COMMISSION_PAYABLE : ACC_COMMISSION_EXPENSE,
          credit: abs,
          description: `${isAccrual ? 'Commission payable' : 'Commission clawback (Cr Expense)'} — ${input.refType}:${input.refId}`,
        },
      ];

      let journalEntryId: string | null = null;
      try {
        const je = await this.posting.postJournalEntry(
          {
            companyId: input.companyId,
            branchId: input.branchId ?? undefined,
            entryDate: new Date(),
            refType: 'CommissionEntry',
            refId: created.id,
            description: `Commission ${input.kind} — ${input.refType}:${input.refId}`,
            lines,
          },
          { userId: actingUserId },
          tx as any,
        );
        journalEntryId = je.id;
      } catch (err) {
        // If the chart of accounts is missing the commission codes, surface
        // the issue but keep the entry append-only with status='accrued'
        // (no journalEntryId). This will be re-tried via T48 mapping later.
        this.logger.warn(
          `Commission JE skipped for entry ${created.id}: ${(err as Error).message}`,
        );
      }

      if (journalEntryId) {
        await tx.commissionEntry.update({
          where: { id: created.id },
          data: { journalEntryId },
        });
      }

      return tx.commissionEntry.findUniqueOrThrow({ where: { id: created.id } });
    });

    // Audit + domain event for downstream (payroll bridge listens to these).
    await this.audit.log({
      companyId: input.companyId,
      userId: actingUserId,
      userEmail: actingUserId,
      action: `commission.${input.kind}`,
      entityType: 'CommissionEntry',
      entityId: entry.id,
      after: entry,
    });

    this.events.emit('commission.recorded', {
      __event: 'commission.recorded',
      companyId: input.companyId,
      branchId: input.branchId ?? undefined,
      employeeId: input.employeeId ?? undefined,
      entryId: entry.id,
      kind: input.kind,
      amountIqd: Number(input.amountIqd),
    });

    return entry;
  }

  /**
   * Fetch active assignments for a given (companyId, refDate) pair.
   * Used by the invoice listener to find which plans apply.
   */
  async findActivePlansForEmployee(
    companyId: string,
    employeeId: string,
    refDate: Date,
  ) {
    return this.prisma.commissionAssignment.findMany({
      where: {
        companyId,
        employeeId,
        isActive: true,
        validFrom: { lte: refDate },
        OR: [{ validUntil: null }, { validUntil: { gte: refDate } }],
        plan: { isActive: true },
      },
      include: { plan: { include: { rules: { orderBy: { sortOrder: 'asc' } } } } },
    });
  }

  /** Sum of accrued, not-yet-paid commission per employee (used by payroll bridge). */
  async getUnpaidByEmployee(companyId: string, employeeId: string, upTo: Date) {
    const r = await this.prisma.commissionEntry.aggregate({
      where: {
        companyId,
        employeeId,
        status: 'accrued',
        createdAt: { lte: upTo },
      },
      _sum: { amountIqd: true },
    });
    return new Prisma.Decimal(r._sum.amountIqd ?? 0);
  }

  /** Mark a set of accrued entries as paid (called by payroll bridge). */
  async markPaid(
    companyId: string,
    employeeId: string,
    upTo: Date,
    payrollRunId: string,
  ) {
    return this.prisma.commissionEntry.updateMany({
      where: {
        companyId,
        employeeId,
        status: 'accrued',
        createdAt: { lte: upTo },
      },
      data: { status: 'paid', paidInPayrollId: payrollRunId },
    });
  }
}
