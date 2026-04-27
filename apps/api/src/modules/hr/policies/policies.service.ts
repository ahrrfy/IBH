import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { NotificationsService } from '../../../platform/notifications/notifications.service';
import type { UserSession } from '@erp/shared-types';
import {
  CreatePolicyDto,
  UpdatePolicyDto,
  AcknowledgePolicyDto,
} from './dto/policies.dto';

/**
 * HR Policies + Acknowledgments service (T52).
 *
 * Acknowledgments are **immutable, append-only**, with a per-employee hash
 * chain (SHA-256 of prevHash + companyId + employeeId + policyId + version
 * + acknowledgedAt). Repeat acknowledgments of the same (policy, version)
 * are rejected by a unique constraint at the DB layer.
 *
 * On `publish`, the service auto-fans-out an in-app notification to every
 * active employee that has a linked user account (T46 dispatch).
 */
@Injectable()
export class PoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async createPolicy(dto: CreatePolicyDto, session: UserSession) {
    const dup = await this.prisma.policy.findFirst({
      where: { companyId: session.companyId, code: dto.code },
    });
    if (dup) {
      throw new ConflictException({
        code: 'POLICY_CODE_EXISTS',
        messageAr: 'رمز السياسة مستخدم مسبقاً',
      });
    }
    const p = await this.prisma.policy.create({
      data: {
        companyId: session.companyId,
        code: dto.code,
        titleAr: dto.titleAr,
        bodyMd: dto.bodyMd,
        version: 1,
        status: 'draft',
        createdBy: session.userId,
        updatedBy: session.userId,
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'hr.policy.create',
      entityType: 'Policy',
      entityId: p.id,
      after: p,
    });
    return p;
  }

  /**
   * Edit a draft policy. If the policy is `published`, this bumps `version`
   * and resets status back to `draft` (republish via `publish()` re-fans the
   * acknowledgment requirement out to all employees).
   */
  async updatePolicy(id: string, dto: UpdatePolicyDto, session: UserSession) {
    const p = await this.prisma.policy.findFirst({
      where: { id, companyId: session.companyId },
    });
    if (!p) {
      throw new NotFoundException({
        code: 'POLICY_NOT_FOUND',
        messageAr: 'السياسة غير موجودة',
      });
    }
    const bump = p.status === 'published';
    return this.prisma.policy.update({
      where: { id },
      data: {
        titleAr: dto.titleAr ?? undefined,
        bodyMd: dto.bodyMd ?? undefined,
        ...(bump
          ? { version: p.version + 1, status: 'draft', publishedAt: null }
          : {}),
        updatedBy: session.userId,
      },
    });
  }

  async listPolicies(companyId: string) {
    return this.prisma.policy.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPolicy(id: string, companyId: string) {
    const p = await this.prisma.policy.findFirst({
      where: { id, companyId },
    });
    if (!p) {
      throw new NotFoundException({
        code: 'POLICY_NOT_FOUND',
        messageAr: 'السياسة غير موجودة',
      });
    }
    return p;
  }

  /** Publish a draft policy and fan out acknowledgment requests to employees. */
  async publish(id: string, session: UserSession) {
    const p = await this.getPolicy(id, session.companyId);
    if (p.status !== 'draft') {
      throw new BadRequestException({
        code: 'POLICY_NOT_DRAFT',
        messageAr: 'السياسة ليست في حالة مسودة',
      });
    }
    const updated = await this.prisma.policy.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date() },
    });

    // Fan-out: notify every active employee with a user account.
    const employees = await this.prisma.employee.findMany({
      where: {
        companyId: session.companyId,
        status: 'active',
        userId: { not: null },
      },
      select: { userId: true },
    });
    for (const e of employees) {
      if (!e.userId) continue;
      try {
        await this.notifications.dispatch({
          companyId: session.companyId,
          userId: e.userId,
          eventType: 'hr.policy.published',
          title: 'سياسة جديدة تتطلب موافقتك',
          body: `${p.titleAr} (الإصدار ${updated.version})`,
          data: { policyId: p.id, version: updated.version },
        });
      } catch {
        /* best effort */
      }
    }

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'hr.policy.publish',
      entityType: 'Policy',
      entityId: p.id,
      after: { version: updated.version, status: 'published' },
    });
    return updated;
  }

  // ── Acknowledgments (employee side) ─────────────────────────────────

  /**
   * List published policies + which the current employee has acknowledged at
   * their latest version. Used by the employee policy-ack portal.
   */
  async listForEmployee(companyId: string, employeeId: string) {
    const policies = await this.prisma.policy.findMany({
      where: { companyId, status: 'published' },
      orderBy: { publishedAt: 'desc' },
    });
    const acks = await this.prisma.policyAcknowledgment.findMany({
      where: { companyId, employeeId },
      select: { policyId: true, policyVersion: true },
    });
    const ackMap = new Map<string, number>();
    for (const a of acks) {
      const cur = ackMap.get(a.policyId) ?? 0;
      if (a.policyVersion > cur) ackMap.set(a.policyId, a.policyVersion);
    }
    return policies.map((p) => ({
      id: p.id,
      code: p.code,
      titleAr: p.titleAr,
      bodyMd: p.bodyMd,
      version: p.version,
      publishedAt: p.publishedAt,
      acknowledged: (ackMap.get(p.id) ?? 0) >= p.version,
    }));
  }

  /**
   * Append an acknowledgment record. Hash chained per (companyId, employeeId).
   *
   * Throws on:
   *  - policy not found / not published
   *  - version mismatch (employee tried to ack an older version)
   *  - duplicate ack for same (policy, version) — DB unique constraint
   */
  async acknowledge(
    dto: AcknowledgePolicyDto,
    employeeId: string,
    session: UserSession,
    sourceIp?: string,
  ) {
    const policy = await this.prisma.policy.findFirst({
      where: {
        id: dto.policyId,
        companyId: session.companyId,
        status: 'published',
      },
    });
    if (!policy) {
      throw new NotFoundException({
        code: 'POLICY_NOT_FOUND_OR_UNPUBLISHED',
        messageAr: 'السياسة غير منشورة',
      });
    }
    if (policy.version !== dto.policyVersion) {
      throw new BadRequestException({
        code: 'POLICY_VERSION_STALE',
        messageAr: 'إصدار السياسة قديم — أعد التحميل',
      });
    }

    const last = await this.prisma.policyAcknowledgment.findFirst({
      where: { companyId: session.companyId, employeeId },
      orderBy: { acknowledgedAt: 'desc' },
      select: { hash: true },
    });
    const acknowledgedAt = new Date();
    const hash = createHash('sha256')
      .update(
        [
          last?.hash ?? '',
          session.companyId,
          employeeId,
          policy.id,
          policy.version,
          acknowledgedAt.toISOString(),
        ].join('|'),
      )
      .digest('hex');

    try {
      const ack = await this.prisma.policyAcknowledgment.create({
        data: {
          companyId: session.companyId,
          policyId: policy.id,
          policyVersion: policy.version,
          employeeId,
          acknowledgedAt,
          hash,
          prevHash: last?.hash ?? null,
          sourceIp: sourceIp ?? null,
        },
      });
      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'hr.policy.acknowledge',
        entityType: 'PolicyAcknowledgment',
        entityId: ack.id,
        after: { policyId: policy.id, version: policy.version, hash },
      });
      return { id: ack.id, hash, acknowledgedAt };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException({
          code: 'POLICY_ALREADY_ACKNOWLEDGED',
          messageAr: 'تم توقيع هذه السياسة مسبقاً',
        });
      }
      throw e;
    }
  }

  /**
   * Verify the integrity of an employee's acknowledgment chain.
   * Walks every record in chronological order and recomputes hashes.
   */
  async verifyChain(companyId: string, employeeId: string): Promise<boolean> {
    const all = await this.prisma.policyAcknowledgment.findMany({
      where: { companyId, employeeId },
      orderBy: { acknowledgedAt: 'asc' },
    });
    let prev: string | null = null;
    for (const ack of all) {
      const expected = createHash('sha256')
        .update(
          [
            prev ?? '',
            companyId,
            employeeId,
            ack.policyId,
            ack.policyVersion,
            ack.acknowledgedAt.toISOString(),
          ].join('|'),
        )
        .digest('hex');
      if (expected !== ack.hash) return false;
      if ((ack.prevHash ?? null) !== prev) return false;
      prev = ack.hash;
    }
    return true;
  }
}
