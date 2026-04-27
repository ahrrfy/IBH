import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { NotificationsService } from '../../../platform/notifications/notifications.service';
import type { UserSession } from '@erp/shared-types';
import {
  CreateContractTemplateDto,
  UpdateContractTemplateDto,
  CreateContractDto,
} from './dto/contracts.dto';
import { renderTemplate } from './template-renderer';
import { renderPdf } from './pdf-emitter';

/**
 * HR Employment Contracts service (T52).
 *
 * Owns:
 *  - Contract templates (CRUD, with merge-field placeholders).
 *  - Employment contracts (issued from templates, immutable once active).
 *  - Server-side PDF rendering of contract bodies.
 *  - 30-day renewal-reminder dispatcher (idempotent — `renewalNotifiedAt` flag).
 *
 * Immutability rule: once `status != draft` the rendered body MUST NOT change.
 * The body hash is recomputed on read and rejected if mutated. To "fix" a
 * shipped contract, terminate it and issue a new one — never edit in place.
 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Templates ─────────────────────────────────────────────────────────

  async createTemplate(dto: CreateContractTemplateDto, session: UserSession) {
    const dup = await this.prisma.contractTemplate.findFirst({
      where: { companyId: session.companyId, code: dto.code },
    });
    if (dup) {
      throw new ConflictException({
        code: 'TEMPLATE_CODE_EXISTS',
        messageAr: 'رمز القالب مستخدم مسبقاً',
      });
    }
    const tpl = await this.prisma.contractTemplate.create({
      data: {
        companyId: session.companyId,
        code: dto.code,
        nameAr: dto.nameAr,
        bodyMd: dto.bodyMd,
        renewDays: dto.renewDays ?? 30,
        status: 'draft',
        createdBy: session.userId,
        updatedBy: session.userId,
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'hr.contractTemplate.create',
      entityType: 'ContractTemplate',
      entityId: tpl.id,
      after: tpl,
    });
    return tpl;
  }

  async listTemplates(companyId: string) {
    return this.prisma.contractTemplate.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateTemplate(
    id: string,
    dto: UpdateContractTemplateDto,
    session: UserSession,
  ) {
    const tpl = await this.prisma.contractTemplate.findFirst({
      where: { id, companyId: session.companyId },
    });
    if (!tpl) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        messageAr: 'القالب غير موجود',
      });
    }
    return this.prisma.contractTemplate.update({
      where: { id },
      data: {
        nameAr: dto.nameAr ?? undefined,
        bodyMd: dto.bodyMd ?? undefined,
        renewDays: dto.renewDays ?? undefined,
        code: dto.code ?? undefined,
        updatedBy: session.userId,
      },
    });
  }

  async setTemplateStatus(
    id: string,
    status: 'draft' | 'active' | 'archived',
    session: UserSession,
  ) {
    const tpl = await this.prisma.contractTemplate.findFirst({
      where: { id, companyId: session.companyId },
    });
    if (!tpl) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        messageAr: 'القالب غير موجود',
      });
    }
    return this.prisma.contractTemplate.update({
      where: { id },
      data: { status, updatedBy: session.userId },
    });
  }

  // ── Contracts ─────────────────────────────────────────────────────────

  /**
   * Issue a new employment contract from an active template. Renders merge
   * fields server-side, freezes the body, and stores its SHA-256 hash.
   *
   * If `offerLetterId` is provided, validates it belongs to the same company
   * AND is in `accepted` state (read-only check; recruitment isn't mutated).
   */
  async createContract(dto: CreateContractDto, session: UserSession) {
    const tpl = await this.prisma.contractTemplate.findFirst({
      where: {
        id: dto.templateId,
        companyId: session.companyId,
        status: 'active',
      },
    });
    if (!tpl) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_ACTIVE',
        messageAr: 'القالب غير متاح أو غير مفعّل',
      });
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId: session.companyId },
    });
    if (!employee) {
      throw new NotFoundException({
        code: 'EMPLOYEE_NOT_FOUND',
        messageAr: 'الموظف غير موجود',
      });
    }

    // Read-only consume of recruitment offer (T51) — never mutate.
    if (dto.offerLetterId) {
      const offer = await this.prisma.offerLetter.findFirst({
        where: {
          id: dto.offerLetterId,
          companyId: session.companyId,
        },
        select: { id: true, status: true, applicationId: true },
      });
      if (!offer || offer.status !== 'accepted') {
        throw new BadRequestException({
          code: 'OFFER_NOT_ACCEPTED',
          messageAr: 'عرض التوظيف ليس مقبولاً',
        });
      }
    }

    const dupNo = await this.prisma.employmentContract.findFirst({
      where: { companyId: session.companyId, contractNo: dto.contractNo },
    });
    if (dupNo) {
      throw new ConflictException({
        code: 'CONTRACT_NO_EXISTS',
        messageAr: 'رقم العقد مستخدم مسبقاً',
      });
    }

    const salary = new Prisma.Decimal(dto.salaryIqd as any);
    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (endDate && endDate <= startDate) {
      throw new BadRequestException({
        code: 'CONTRACT_DATE_INVALID',
        messageAr: 'تاريخ نهاية العقد يجب أن يكون بعد البداية',
      });
    }

    // Render — strict mode throws on any unknown placeholder.
    const ctx = {
      employee: {
        name: employee.nameAr,
        nameEn: employee.nameEn ?? '',
        nationalId: employee.nationalId ?? '',
        phone: employee.phone ?? '',
      },
      contract: {
        no: dto.contractNo,
        startDate: dto.startDate,
        endDate: dto.endDate ?? '',
      },
      salary: {
        amount: salary.toFixed(3),
        currency: 'IQD',
      },
      company: { id: session.companyId },
    };
    const { body: rendered } = renderTemplate(tpl.bodyMd, ctx);
    const bodyHash = createHash('sha256').update(rendered, 'utf8').digest('hex');

    const contract = await this.prisma.employmentContract.create({
      data: {
        companyId: session.companyId,
        templateId: tpl.id,
        employeeId: dto.employeeId,
        offerLetterId: dto.offerLetterId ?? null,
        contractNo: dto.contractNo,
        startDate,
        endDate: endDate,
        salaryIqd: salary,
        renderedBody: rendered,
        bodyHash,
        status: 'draft',
        createdBy: session.userId,
      },
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'hr.contract.create',
      entityType: 'EmploymentContract',
      entityId: contract.id,
      after: { id: contract.id, contractNo: contract.contractNo, hash: bodyHash },
    });

    return contract;
  }

  async listContracts(companyId: string, filters?: { status?: string; employeeId?: string }) {
    return this.prisma.employmentContract.findMany({
      where: {
        companyId,
        ...(filters?.status ? { status: filters.status as any } : {}),
        ...(filters?.employeeId ? { employeeId: filters.employeeId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Read a contract and verify the stored body hash hasn't been tampered with. */
  async getContract(id: string, companyId: string) {
    const c = await this.prisma.employmentContract.findFirst({
      where: { id, companyId },
    });
    if (!c) {
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        messageAr: 'العقد غير موجود',
      });
    }
    const expected = createHash('sha256').update(c.renderedBody, 'utf8').digest('hex');
    if (expected !== c.bodyHash) {
      throw new BadRequestException({
        code: 'CONTRACT_BODY_TAMPERED',
        messageAr: 'تلاعب مكتشف في نص العقد',
      });
    }
    return c;
  }

  async activate(id: string, session: UserSession) {
    const c = await this.getContract(id, session.companyId);
    if (c.status !== 'draft') {
      throw new BadRequestException({
        code: 'CONTRACT_NOT_DRAFT',
        messageAr: 'لا يمكن تفعيل عقد ليس في حالة مسودة',
      });
    }
    const updated = await this.prisma.employmentContract.update({
      where: { id },
      data: {
        status: 'active',
        signedAt: new Date(),
        signedBy: session.userId,
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'hr.contract.activate',
      entityType: 'EmploymentContract',
      entityId: id,
      before: { status: c.status },
      after: { status: 'active' },
    });
    return updated;
  }

  /** Render the contract as a PDF byte stream. */
  async renderPdf(id: string, companyId: string): Promise<Buffer> {
    const c = await this.getContract(id, companyId);
    return renderPdf(c.renderedBody);
  }

  /**
   * Sweep contracts whose `endDate` falls within the next 30 days and dispatch
   * a one-time renewal notification to the contract creator.
   *
   * Idempotent: `renewalNotifiedAt` is set on first dispatch; subsequent calls
   * skip the row. Designed to be invoked by a daily cron (T46 dispatch infra).
   */
  async runRenewalSweep(now: Date = new Date()): Promise<{ notified: number }> {
    const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const due = await this.prisma.employmentContract.findMany({
      where: {
        status: 'active',
        renewalNotifiedAt: null,
        endDate: { not: null, gte: now, lte: horizon },
      },
    });
    let notified = 0;
    for (const c of due) {
      try {
        await this.notifications.dispatch({
          companyId: c.companyId,
          userId: c.createdBy,
          eventType: 'hr.contract.renewal_due',
          title: 'تجديد عقد قريب',
          body: `العقد ${c.contractNo} ينتهي في ${c.endDate?.toISOString().slice(0, 10)}`,
          data: { contractId: c.id, contractNo: c.contractNo, endDate: c.endDate },
        });
        await this.prisma.employmentContract.update({
          where: { id: c.id },
          data: { renewalNotifiedAt: new Date() },
        });
        notified++;
      } catch {
        // Best-effort — never throw out of a sweep loop.
      }
    }
    return { notified };
  }
}
