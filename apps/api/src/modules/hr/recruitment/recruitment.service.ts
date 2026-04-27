import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import type { UserSession } from '@erp/shared-types';
import {
  CreateJobPostingDto,
  UpdateJobPostingDto,
  SubmitApplicationDto,
  TransitionApplicationDto,
  ScheduleInterviewDto,
  RecordInterviewOutcomeDto,
  CreateOfferLetterDto,
} from './dto/recruitment.dto';
import {
  ApplicationStatus,
  assertTransition,
  computeAutoScreenScore,
  AUTO_SCREEN_THRESHOLD,
} from './application-state-machine';

/**
 * HR Recruitment service (T51).
 *
 * Owns:
 *  - Job postings CRUD + open/close
 *  - Public application intake (no auth) with rule-based auto-screen
 *  - Internal application kanban transitions (state machine enforced)
 *  - Interview rounds (append-only-ish)
 *  - Offer letters (one per application)
 *
 * Tier 3 only — no AI per F5. Pure rule-based scorer in
 * `application-state-machine.ts`.
 */
@Injectable()
export class RecruitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────
  // JOB POSTINGS (admin / RBAC)
  // ──────────────────────────────────────────────────────────────────────

  async createJobPosting(dto: CreateJobPostingDto, session: UserSession) {
    const dup = await this.prisma.jobPosting.findFirst({
      where: { companyId: session.companyId, slug: dto.slug },
    });
    if (dup) {
      throw new ConflictException({
        code: 'JOB_SLUG_EXISTS',
        messageAr: 'هذا الرابط مستخدم سابقاً، اختر رابطاً آخر',
      });
    }
    const posting = await this.prisma.jobPosting.create({
      data: {
        companyId: session.companyId,
        branchId: dto.branchId ?? null,
        departmentId: dto.departmentId ?? null,
        slug: dto.slug,
        titleAr: dto.titleAr,
        titleEn: dto.titleEn ?? null,
        descriptionAr: dto.descriptionAr,
        requirementsAr: dto.requirementsAr ?? null,
        keywords: dto.keywords ?? null,
        minYearsExperience: dto.minYearsExperience ?? 0,
        employmentType: dto.employmentType ?? 'full_time',
        salaryMinIqd: dto.salaryMinIqd != null ? new Prisma.Decimal(dto.salaryMinIqd) : null,
        salaryMaxIqd: dto.salaryMaxIqd != null ? new Prisma.Decimal(dto.salaryMaxIqd) : null,
        location: dto.location ?? null,
        status: 'draft',
        createdBy: session.userId,
        updatedBy: session.userId,
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'CREATE',
      entity: 'JobPosting',
      entityId: posting.id,
      after: posting,
    });
    return posting;
  }

  async listJobPostings(
    companyId: string,
    filters?: { status?: string; search?: string },
  ) {
    const where: Prisma.JobPostingWhereInput = {
      companyId,
      ...(filters?.status ? { status: filters.status as any } : {}),
      ...(filters?.search
        ? {
            OR: [
              { titleAr: { contains: filters.search, mode: 'insensitive' } },
              { titleEn: { contains: filters.search, mode: 'insensitive' } },
              { slug: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.prisma.jobPosting.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getJobPosting(id: string, companyId: string) {
    const posting = await this.prisma.jobPosting.findFirst({
      where: { id, companyId },
    });
    if (!posting) {
      throw new NotFoundException({
        code: 'JOB_NOT_FOUND',
        messageAr: 'الوظيفة غير موجودة',
      });
    }
    return posting;
  }

  async updateJobPosting(id: string, dto: UpdateJobPostingDto, session: UserSession) {
    const before = await this.getJobPosting(id, session.companyId);
    const data: Prisma.JobPostingUpdateInput = {};
    if (dto.titleAr !== undefined) data.titleAr = dto.titleAr;
    if (dto.titleEn !== undefined) data.titleEn = dto.titleEn;
    if (dto.descriptionAr !== undefined) data.descriptionAr = dto.descriptionAr;
    if (dto.requirementsAr !== undefined) data.requirementsAr = dto.requirementsAr;
    if (dto.keywords !== undefined) data.keywords = dto.keywords;
    if (dto.minYearsExperience !== undefined) data.minYearsExperience = dto.minYearsExperience;
    if (dto.employmentType !== undefined) data.employmentType = dto.employmentType;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.salaryMinIqd !== undefined) {
      data.salaryMinIqd = dto.salaryMinIqd != null ? new Prisma.Decimal(dto.salaryMinIqd) : null;
    }
    if (dto.salaryMaxIqd !== undefined) {
      data.salaryMaxIqd = dto.salaryMaxIqd != null ? new Prisma.Decimal(dto.salaryMaxIqd) : null;
    }
    data.updatedBy = session.userId;
    const after = await this.prisma.jobPosting.update({ where: { id }, data });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'UPDATE',
      entity: 'JobPosting',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async setJobPostingStatus(
    id: string,
    next: 'draft' | 'open' | 'paused' | 'closed',
    session: UserSession,
  ) {
    const before = await this.getJobPosting(id, session.companyId);
    if (before.status === next) return before;
    const data: Prisma.JobPostingUpdateInput = {
      status: next,
      updatedBy: session.userId,
    };
    if (next === 'open' && !before.openedAt) data.openedAt = new Date();
    if (next === 'closed') data.closedAt = new Date();
    const after = await this.prisma.jobPosting.update({ where: { id }, data });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: `JOB_${next.toUpperCase()}`,
      entity: 'JobPosting',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  // ──────────────────────────────────────────────────────────────────────
  // PUBLIC JOB BOARD (no auth)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Public list of OPEN postings — used by the public job board.
   * No companyId scoping is applied here because the board is per-tenant
   * via the `companyId` resolved from a tenant-aware request context.
   * (For now we return all 'open' postings; multi-tenant routing is the
   *  responsibility of T58+ licensing/host-routing.)
   */
  async publicListOpen(companyId?: string) {
    return this.prisma.jobPosting.findMany({
      where: {
        status: 'open',
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { openedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        titleAr: true,
        titleEn: true,
        descriptionAr: true,
        requirementsAr: true,
        location: true,
        employmentType: true,
        minYearsExperience: true,
        salaryMinIqd: true,
        salaryMaxIqd: true,
        openedAt: true,
      },
    });
  }

  async publicGetBySlug(slug: string, companyId?: string) {
    const posting = await this.prisma.jobPosting.findFirst({
      where: {
        slug,
        status: 'open',
        ...(companyId ? { companyId } : {}),
      },
      select: {
        id: true,
        companyId: true,
        slug: true,
        titleAr: true,
        titleEn: true,
        descriptionAr: true,
        requirementsAr: true,
        location: true,
        employmentType: true,
        minYearsExperience: true,
        salaryMinIqd: true,
        salaryMaxIqd: true,
        openedAt: true,
      },
    });
    if (!posting) {
      throw new NotFoundException({
        code: 'JOB_NOT_OPEN',
        messageAr: 'الوظيفة غير متاحة',
      });
    }
    return posting;
  }

  /**
   * Public application submission (no auth, rate-limited at controller).
   * Computes auto-screen score and may auto-promote `new → screened`.
   */
  async submitApplication(
    slug: string,
    dto: SubmitApplicationDto,
    meta: { ip?: string; ua?: string },
  ) {
    const posting = await this.prisma.jobPosting.findFirst({
      where: { slug, status: 'open' },
    });
    if (!posting) {
      throw new NotFoundException({
        code: 'JOB_NOT_OPEN',
        messageAr: 'الوظيفة غير متاحة',
      });
    }

    // Cheap dedupe: same email on same posting in last 24h.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dup = await this.prisma.application.findFirst({
      where: {
        jobPostingId: posting.id,
        applicantEmail: dto.applicantEmail.toLowerCase(),
        createdAt: { gte: since },
      },
    });
    if (dup) {
      throw new ConflictException({
        code: 'APPLICATION_DUPLICATE',
        messageAr: 'لقد قدّمت طلباً لهذه الوظيفة مؤخراً',
      });
    }

    const screenSource = `${dto.cvText ?? ''}\n${dto.coverLetter ?? ''}`;
    const score = computeAutoScreenScore({
      candidateYears: dto.yearsExperience ?? 0,
      requiredYears: posting.minYearsExperience ?? 0,
      cvText: screenSource,
      postingKeywords: posting.keywords ?? '',
    });

    const initialStatus: ApplicationStatus =
      score >= AUTO_SCREEN_THRESHOLD ? 'screened' : 'new';

    return this.prisma.application.create({
      data: {
        companyId: posting.companyId,
        jobPostingId: posting.id,
        applicantName: dto.applicantName.trim(),
        applicantEmail: dto.applicantEmail.toLowerCase().trim(),
        applicantPhone: dto.applicantPhone ?? null,
        yearsExperience: dto.yearsExperience ?? 0,
        cvUrl: dto.cvUrl ?? null,
        cvText: dto.cvText ?? null,
        coverLetter: dto.coverLetter ?? null,
        autoScreenScore: score,
        status: initialStatus,
        sourceIp: meta.ip ?? null,
        sourceUa: meta.ua?.slice(0, 300) ?? null,
      },
      select: {
        id: true,
        status: true,
        autoScreenScore: true,
        createdAt: true,
      },
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // APPLICATIONS (admin / RBAC)
  // ──────────────────────────────────────────────────────────────────────

  async listApplications(
    companyId: string,
    filters?: { jobPostingId?: string; status?: string },
  ) {
    return this.prisma.application.findMany({
      where: {
        companyId,
        ...(filters?.jobPostingId ? { jobPostingId: filters.jobPostingId } : {}),
        ...(filters?.status ? { status: filters.status as any } : {}),
      },
      orderBy: [{ autoScreenScore: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getApplication(id: string, companyId: string) {
    const app = await this.prisma.application.findFirst({
      where: { id, companyId },
      include: { stages: { orderBy: { roundNumber: 'asc' } }, offer: true },
    });
    if (!app) {
      throw new NotFoundException({
        code: 'APP_NOT_FOUND',
        messageAr: 'الطلب غير موجود',
      });
    }
    return app;
  }

  async transitionApplication(
    id: string,
    dto: TransitionApplicationDto,
    session: UserSession,
  ) {
    const before = await this.getApplication(id, session.companyId);
    try {
      assertTransition(before.status as ApplicationStatus, dto.toStatus);
    } catch (err) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        messageAr: 'تغيير الحالة غير مسموح',
        details: (err as Error).message,
      });
    }
    if (dto.toStatus === 'rejected' && !dto.rejectionReason) {
      throw new BadRequestException({
        code: 'REJECTION_REASON_REQUIRED',
        messageAr: 'سبب الرفض مطلوب',
      });
    }
    const after = await this.prisma.application.update({
      where: { id },
      data: {
        status: dto.toStatus,
        rejectionReason: dto.toStatus === 'rejected' ? dto.rejectionReason ?? null : null,
        reviewedBy: session.userId,
        reviewedAt: new Date(),
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: `APPLICATION_${dto.toStatus.toUpperCase()}`,
      entity: 'Application',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  // ──────────────────────────────────────────────────────────────────────
  // INTERVIEW STAGES
  // ──────────────────────────────────────────────────────────────────────

  async scheduleInterview(
    applicationId: string,
    dto: ScheduleInterviewDto,
    session: UserSession,
  ) {
    const app = await this.getApplication(applicationId, session.companyId);
    if (app.status !== 'interview' && app.status !== 'screened') {
      throw new BadRequestException({
        code: 'APP_NOT_INTERVIEWING',
        messageAr: 'لا يمكن جدولة مقابلة لطلب في هذه الحالة',
      });
    }
    const dup = await this.prisma.interviewStage.findUnique({
      where: { applicationId_roundNumber: { applicationId, roundNumber: dto.roundNumber } },
    });
    if (dup) {
      throw new ConflictException({
        code: 'INTERVIEW_ROUND_EXISTS',
        messageAr: 'الجولة موجودة مسبقاً',
      });
    }
    const stage = await this.prisma.interviewStage.create({
      data: {
        companyId: session.companyId,
        applicationId,
        roundNumber: dto.roundNumber,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        interviewerId: dto.interviewerId ?? null,
        notes: dto.notes ?? null,
      },
    });
    // Auto-advance status to interview when first round is scheduled.
    if (app.status === 'screened') {
      await this.prisma.application.update({
        where: { id: applicationId },
        data: { status: 'interview', reviewedBy: session.userId, reviewedAt: new Date() },
      });
    }
    return stage;
  }

  async recordInterviewOutcome(
    stageId: string,
    dto: RecordInterviewOutcomeDto,
    session: UserSession,
  ) {
    const stage = await this.prisma.interviewStage.findFirst({
      where: { id: stageId, companyId: session.companyId },
    });
    if (!stage) {
      throw new NotFoundException({
        code: 'INTERVIEW_NOT_FOUND',
        messageAr: 'الجولة غير موجودة',
      });
    }
    return this.prisma.interviewStage.update({
      where: { id: stageId },
      data: {
        outcome: dto.outcome,
        score: dto.score ?? null,
        notes: dto.notes ?? stage.notes,
      },
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // OFFER LETTERS
  // ──────────────────────────────────────────────────────────────────────

  async createOffer(
    applicationId: string,
    dto: CreateOfferLetterDto,
    session: UserSession,
  ) {
    const app = await this.getApplication(applicationId, session.companyId);
    if (app.status !== 'interview' && app.status !== 'offer') {
      throw new BadRequestException({
        code: 'APP_NOT_OFFER_READY',
        messageAr: 'لا يمكن إصدار عرض لطلب في هذه الحالة',
      });
    }
    if (app.offer) {
      throw new ConflictException({
        code: 'OFFER_EXISTS',
        messageAr: 'يوجد عرض مسبق',
      });
    }
    const offer = await this.prisma.offerLetter.create({
      data: {
        companyId: session.companyId,
        applicationId,
        proposedSalaryIqd: new Prisma.Decimal(dto.proposedSalaryIqd),
        startDate: new Date(dto.startDate),
        expiresAt: new Date(dto.expiresAt),
        notes: dto.notes ?? null,
        status: 'draft',
        createdBy: session.userId,
      },
    });
    if (app.status !== 'offer') {
      await this.prisma.application.update({
        where: { id: applicationId },
        data: { status: 'offer', reviewedBy: session.userId, reviewedAt: new Date() },
      });
    }
    return offer;
  }

  async sendOffer(offerId: string, session: UserSession) {
    const offer = await this.prisma.offerLetter.findFirst({
      where: { id: offerId, companyId: session.companyId },
    });
    if (!offer) {
      throw new NotFoundException({
        code: 'OFFER_NOT_FOUND',
        messageAr: 'العرض غير موجود',
      });
    }
    if (offer.status !== 'draft') {
      throw new BadRequestException({
        code: 'OFFER_NOT_DRAFT',
        messageAr: 'لا يمكن إرسال عرض ليس في حالة مسودة',
      });
    }
    return this.prisma.offerLetter.update({
      where: { id: offerId },
      data: { status: 'sent', sentAt: new Date() },
    });
  }
}
