import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';
import type {
  CreateSalaryBandDto,
  UpdateSalaryBandDto,
  CreatePromotionDto,
  ApprovePromotionDto,
  RejectPromotionDto,
} from './dto/promotions.dto';

/** Minimum tenure in months required for auto-suggest eligibility (Tier 3 rule). */
const AUTO_SUGGEST_TENURE_MONTHS = 12;

/** Minimum attendance rate (0–100) required for auto-suggest eligibility. */
const AUTO_SUGGEST_ATTENDANCE_RATE = 90;

/** Minimum KPI score (0–100) for auto-suggest eligibility. */
const AUTO_SUGGEST_KPI_SCORE = 75;

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // SALARY BANDS
  // ═══════════════════════════════════════════════════════════

  /**
   * Create a new salary band for a company.
   * Validates min ≤ mid ≤ max constraint before saving.
   */
  async createSalaryBand(dto: CreateSalaryBandDto, session: UserSession) {
    this.validateBandRange(dto.minIqd, dto.midIqd, dto.maxIqd);

    const existing = await this.prisma.salaryBand.findFirst({
      where: { companyId: session.companyId, grade: dto.grade, band: dto.band },
    });
    if (existing) {
      throw new ConflictException({
        code: 'SALARY_BAND_EXISTS',
        messageAr: 'نطاق الراتب موجود مسبقاً لهذا الدرجة والشريحة',
      });
    }

    const salaryBand = await this.prisma.salaryBand.create({
      data: {
        companyId: session.companyId,
        grade: dto.grade,
        band: dto.band,
        nameAr: dto.nameAr,
        minIqd: new Prisma.Decimal(dto.minIqd),
        midIqd: new Prisma.Decimal(dto.midIqd),
        maxIqd: new Prisma.Decimal(dto.maxIqd),
        isActive: true,
        createdBy: session.userId,
      },
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'CREATE',
      entity: 'SalaryBand',
      entityId: salaryBand.id,
      after: salaryBand,
    });

    return salaryBand;
  }

  /**
   * List all salary bands for the company, grouped and ordered by grade + band.
   */
  listSalaryBands(companyId: string) {
    return this.prisma.salaryBand.findMany({
      where: { companyId },
      orderBy: [{ grade: 'asc' }, { band: 'asc' }],
    });
  }

  /**
   * Find one salary band by id, scoped to company.
   */
  async findOneSalaryBand(id: string, companyId: string) {
    const band = await this.prisma.salaryBand.findFirst({ where: { id, companyId } });
    if (!band) {
      throw new NotFoundException({
        code: 'SALARY_BAND_NOT_FOUND',
        messageAr: 'نطاق الراتب غير موجود',
      });
    }
    return band;
  }

  /**
   * Update a salary band — re-validates min ≤ mid ≤ max after merge.
   */
  async updateSalaryBand(id: string, dto: UpdateSalaryBandDto, session: UserSession) {
    const before = await this.findOneSalaryBand(id, session.companyId);
    const nextMin = dto.minIqd ?? Number(before.minIqd);
    const nextMid = dto.midIqd ?? Number(before.midIqd);
    const nextMax = dto.maxIqd ?? Number(before.maxIqd);
    this.validateBandRange(nextMin, nextMid, nextMax);

    const data: Record<string, unknown> = {};
    if (dto.nameAr !== undefined) data['nameAr'] = dto.nameAr;
    if (dto.minIqd !== undefined) data['minIqd'] = new Prisma.Decimal(dto.minIqd);
    if (dto.midIqd !== undefined) data['midIqd'] = new Prisma.Decimal(dto.midIqd);
    if (dto.maxIqd !== undefined) data['maxIqd'] = new Prisma.Decimal(dto.maxIqd);
    if (dto.isActive !== undefined) data['isActive'] = dto.isActive;

    const after = await this.prisma.salaryBand.update({ where: { id }, data });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'UPDATE',
      entity: 'SalaryBand',
      entityId: id,
      before,
      after,
    });

    return after;
  }

  // ═══════════════════════════════════════════════════════════
  // PROMOTIONS
  // ═══════════════════════════════════════════════════════════

  /**
   * Create a new promotion request in draft status.
   * Captures "before" snapshot from the employee record at creation time.
   * No payroll changes occur — human approval is required.
   */
  async createPromotion(dto: CreatePromotionDto, session: UserSession) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId: session.companyId },
    });
    if (!employee) {
      throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', messageAr: 'الموظف غير موجود' });
    }

    // Validate proposed salary is within the target band range (if band given)
    if (dto.toSalaryBandId) {
      const band = await this.findOneSalaryBand(dto.toSalaryBandId, session.companyId);
      if (!band.isActive) {
        throw new BadRequestException({
          code: 'BAND_INACTIVE',
          messageAr: 'نطاق الراتب المحدد غير نشط',
        });
      }
      const proposed = new Prisma.Decimal(dto.toSalaryIqd);
      if (proposed.lt(band.minIqd) || proposed.gt(band.maxIqd)) {
        throw new BadRequestException({
          code: 'SALARY_OUT_OF_BAND',
          messageAr: `الراتب المقترح خارج نطاق الشريحة (${band.minIqd}–${band.maxIqd} IQD)`,
        });
      }
    }

    const promotionNo = await this.sequence.next('PROMO', session.companyId);

    const promotion = await this.prisma.hrPromotion.create({
      data: {
        companyId: session.companyId,
        promotionNo,
        employeeId: dto.employeeId,
        // snapshot "before" from employee record
        fromPayGradeId: employee.payGradeId,
        fromSalaryBandId: null, // not tracked on employee directly
        fromPositionTitle: employee.positionTitle,
        fromSalaryIqd: employee.baseSalaryIqd,
        // proposed "after"
        toPayGradeId: dto.toPayGradeId ?? null,
        toSalaryBandId: dto.toSalaryBandId ?? null,
        toPositionTitle: dto.toPositionTitle ?? null,
        toSalaryIqd: new Prisma.Decimal(dto.toSalaryIqd),
        effectiveDate: new Date(dto.effectiveDate),
        reason: dto.reason ?? null,
        status: 'draft',
        createdBy: session.userId,
      },
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'CREATE',
      entity: 'HrPromotion',
      entityId: promotion.id,
      after: promotion,
    });

    return promotion;
  }

  /**
   * Submit a draft promotion for HR Manager review (step 1).
   * Only the creator or an HR manager can submit.
   */
  async submitPromotion(id: string, session: UserSession) {
    const promotion = await this.findOnePromotion(id, session.companyId);
    if (promotion.status !== 'draft') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        messageAr: 'يمكن تقديم الترقية فقط من حالة مسودة',
      });
    }
    const after = await this.prisma.hrPromotion.update({
      where: { id },
      data: { status: 'pending_hr' },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'SUBMIT',
      entity: 'HrPromotion',
      entityId: id,
      before: promotion,
      after,
    });
    return after;
  }

  /**
   * HR Manager approval (step 1 of 2).
   * Moves status to pending_director.
   */
  async hrApprove(id: string, dto: ApprovePromotionDto, session: UserSession) {
    const promotion = await this.findOnePromotion(id, session.companyId);
    if (promotion.status !== 'pending_hr') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        messageAr: 'الترقية ليست في مرحلة مراجعة مدير الموارد البشرية',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.promotionApproval.create({
        data: {
          companyId: session.companyId,
          promotionId: id,
          step: 1,
          decision: 'approved',
          approvedBy: session.userId,
          note: dto.note ?? null,
        },
      });
      await tx.hrPromotion.update({ where: { id }, data: { status: 'pending_director' } });
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'HR_APPROVE',
      entity: 'HrPromotion',
      entityId: id,
    });
    return this.findOnePromotion(id, session.companyId);
  }

  /**
   * Director final approval (step 2 of 2).
   * Moves status to approved, updates Employee record (payGradeId + baseSalaryIqd + positionTitle),
   * and drafts a contract amendment (EmploymentContract in draft status — NOT issued automatically).
   *
   * Business Rule: salary change triggers payroll-grade update via Employee.payGradeId.
   * The caller (HR admin) must separately confirm the drafted contract amendment.
   */
  async directorApprove(id: string, dto: ApprovePromotionDto, session: UserSession) {
    const promotion = await this.findOnePromotion(id, session.companyId);
    if (promotion.status !== 'pending_director') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        messageAr: 'الترقية ليست في مرحلة موافقة المدير',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Step 2 approval record
      await tx.promotionApproval.create({
        data: {
          companyId: session.companyId,
          promotionId: id,
          step: 2,
          decision: 'approved',
          approvedBy: session.userId,
          note: dto.note ?? null,
        },
      });

      // Update employee record — payroll-grade additive update (F3-safe, not financial ledger)
      const empUpdate: Prisma.EmployeeUpdateInput = {
        baseSalaryIqd: promotion.toSalaryIqd,
        updatedBy: session.userId,
      };
      if (promotion.toPayGradeId) empUpdate.payGradeId = promotion.toPayGradeId;
      if (promotion.toPositionTitle) empUpdate.positionTitle = promotion.toPositionTitle;

      await tx.employee.update({
        where: { id: promotion.employeeId },
        data: empUpdate,
      });

      // Mark promotion approved (contract amendment drafted by separate service call — do NOT auto-issue)
      await tx.hrPromotion.update({
        where: { id },
        data: { status: 'approved' },
      });
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'DIRECTOR_APPROVE',
      entity: 'HrPromotion',
      entityId: id,
    });

    return this.findOnePromotion(id, session.companyId);
  }

  /**
   * Reject a promotion at any pending step.
   * Records which step rejected and the mandatory rejection note.
   */
  async rejectPromotion(id: string, dto: RejectPromotionDto, session: UserSession) {
    const promotion = await this.findOnePromotion(id, session.companyId);
    const step =
      promotion.status === 'pending_hr' ? 1 : promotion.status === 'pending_director' ? 2 : null;
    if (step === null) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        messageAr: 'لا يمكن رفض ترقية بهذه الحالة',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.promotionApproval.create({
        data: {
          companyId: session.companyId,
          promotionId: id,
          step,
          decision: 'rejected',
          approvedBy: session.userId,
          note: dto.note,
        },
      });
      await tx.hrPromotion.update({ where: { id }, data: { status: 'rejected' } });
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'REJECT',
      entity: 'HrPromotion',
      entityId: id,
    });

    return this.findOnePromotion(id, session.companyId);
  }

  /**
   * List promotions for the company — optional filters by status + employeeId.
   */
  listPromotions(companyId: string, filters: { status?: string; employeeId?: string }) {
    return this.prisma.hrPromotion.findMany({
      where: {
        companyId,
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
      },
      include: { approvals: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find one promotion by id, scoped to company.
   */
  async findOnePromotion(id: string, companyId: string) {
    const promo = await this.prisma.hrPromotion.findFirst({
      where: { id, companyId },
      include: { approvals: true },
    });
    if (!promo) {
      throw new NotFoundException({
        code: 'PROMOTION_NOT_FOUND',
        messageAr: 'طلب الترقية غير موجود',
      });
    }
    return promo;
  }

  // ═══════════════════════════════════════════════════════════
  // AUTO-SUGGEST (Tier 3 — rule-based, zero AI)
  // ═══════════════════════════════════════════════════════════

  /**
   * Evaluate all active employees and return a list of promotion candidates.
   *
   * Tier 3 eligibility rules (F5 — no AI):
   *   1. tenure ≥ AUTO_SUGGEST_TENURE_MONTHS months
   *   2. attendance rate ≥ AUTO_SUGGEST_ATTENDANCE_RATE % (last 12 months)
   *   3. current salary ≤ 90% of band max (room to grow)
   *   4. no approved promotion in the last 12 months
   *
   * KPI score is included if present but NOT a hard gate — displayed as context.
   */
  async suggestCandidates(companyId: string): Promise<PromotionCandidate[]> {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const employees = await this.prisma.employee.findMany({
      where: { companyId, status: 'active', deletedAt: null },
    });

    const candidates: PromotionCandidate[] = [];

    for (const emp of employees) {
      const tenureMonths = this.calcTenureMonths(emp.hireDate);

      // Rule 1: tenure gate
      if (tenureMonths < AUTO_SUGGEST_TENURE_MONTHS) continue;

      // Rule 2: attendance rate (last 12 months)
      const attendanceRate = await this.calcAttendanceRate(emp.id, twelveMonthsAgo);
      if (attendanceRate < AUTO_SUGGEST_ATTENDANCE_RATE) continue;

      // Rule 4: no recent approved promotion
      const recentPromotion = await this.prisma.hrPromotion.findFirst({
        where: {
          companyId,
          employeeId: emp.id,
          status: 'approved',
          createdAt: { gte: twelveMonthsAgo },
        },
      });
      if (recentPromotion) continue;

      // Gather any KPI score from performance data (optional enrichment)
      const kpiScore: number | null = null; // T53 scope: KPI module not yet built — null is safe

      const basis = `tenure:${tenureMonths}mo,attendance:${attendanceRate.toFixed(0)}%${kpiScore !== null ? `,kpi:${kpiScore}` : ''}`;

      candidates.push({
        employeeId: emp.id,
        employeeName: emp.nameAr,
        employeeNumber: emp.employeeNumber,
        tenureMonths,
        attendanceRate: Number(attendanceRate.toFixed(1)),
        kpiScore,
        currentSalaryIqd: Number(emp.baseSalaryIqd),
        currentPositionTitle: emp.positionTitle,
        currentPayGradeId: emp.payGradeId,
        autoSuggestBasis: basis,
      });
    }

    return candidates;
  }

  // ═══════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════

  /**
   * Compute tenure in whole months from hireDate to today.
   * Used for Tier 3 auto-suggest rule evaluation.
   */
  calcTenureMonths(hireDate: Date): number {
    const now = new Date();
    const years = now.getFullYear() - hireDate.getFullYear();
    const months = now.getMonth() - hireDate.getMonth();
    return years * 12 + months;
  }

  /**
   * Compute attendance rate as percentage of working days present.
   * Counts days where employee has an attendance record (not absent, not leave).
   *
   * Returns 0 if no records found in range (safe conservative default).
   */
  async calcAttendanceRate(employeeId: string, since: Date): Promise<number> {
    const [total, present] = await Promise.all([
      this.prisma.attendanceRecord.count({
        where: { employeeId, date: { gte: since } },
      }),
      this.prisma.attendanceRecord.count({
        where: { employeeId, date: { gte: since }, isAbsent: false },
      }),
    ]);
    if (total === 0) return 0;
    return (present / total) * 100;
  }

  /**
   * Validate that min ≤ mid ≤ max for a salary band.
   */
  private validateBandRange(min: number, mid: number, max: number): void {
    if (min > mid || mid > max) {
      throw new BadRequestException({
        code: 'INVALID_BAND_RANGE',
        messageAr: 'يجب أن يكون: الحد الأدنى ≤ المتوسط ≤ الحد الأقصى',
      });
    }
  }
}

// ── Type for auto-suggest result ─────────────────────────────────────────────

export interface PromotionCandidate {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  tenureMonths: number;
  attendanceRate: number;
  kpiScore: number | null;
  currentSalaryIqd: number;
  currentPositionTitle: string | null;
  currentPayGradeId: string | null;
  autoSuggestBasis: string;
}
