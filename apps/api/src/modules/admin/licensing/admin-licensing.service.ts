/**
 * AdminLicensingService — T63 Super Admin Dashboard backend.
 *
 * Provides read + management operations over Subscription / Plan / LicenseEvent
 * for the super-admin licensing dashboard. All write actions emit a
 * LicenseEvent and an AuditLog entry (entityType='Subscription') so the
 * audit page can reconstruct history.
 *
 * Authorization: every method assumes the caller is already gated by
 * RequirePermission('License', 'admin') at the controller level, which
 * resolves to super-admin via RbacGuard's role short-circuit.
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { PlanChangeService } from '../../../platform/licensing/plan-change.service';
import type { UserSession } from '@erp/shared-types';

export type SubscriptionStatusFilter =
  | 'pending'
  | 'trial'
  | 'active'
  | 'grace'
  | 'suspended'
  | 'expired'
  | 'cancelled';

export interface ListTenantsParams {
  status?: SubscriptionStatusFilter;
  search?: string;
  skip?: number;
  take?: number;
}

@Injectable()
export class AdminLicensingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planChange: PlanChangeService,
  ) {}

  /**
   * List subscriptions with company name, plan, device count, MRR contribution.
   * Optional status filter + company-name search.
   */
  async listTenants(params: ListTenantsParams) {
    const take = Math.min(Math.max(params.take ?? 50, 1), 200);
    const skip = Math.max(params.skip ?? 0, 0);

    const where: any = {};
    if (params.status) where.status = params.status;

    // Company-name search resolved in-memory after load (typical tenant
    // counts are small in super-admin context; no additional join needed).
    const [total, rowsRaw] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          plan: { select: { id: true, code: true, name: true } },
          _count: { select: { licenseKeys: true } },
        },
        skip,
        take,
      }),
    ]);

    // Pull all referenced companies in one query
    const companyIds = Array.from(new Set(rowsRaw.map((r) => r.companyId)));
    const companies = companyIds.length
      ? await this.prisma.company.findMany({
          where: { id: { in: companyIds } },
          select: { id: true, code: true, nameAr: true, nameEn: true },
        })
      : [];
    const companyById = new Map(companies.map((c) => [c.id, c]));

    let items = rowsRaw.map((r) => {
      const c = companyById.get(r.companyId);
      const monthlyMrrIqd =
        r.billingCycle === 'monthly'
          ? Number(r.priceIqd)
          : r.billingCycle === 'annual'
            ? Number(r.priceIqd) / 12
            : Number(r.priceIqd);
      return {
        id: r.id,
        companyId: r.companyId,
        companyCode: c?.code ?? null,
        companyNameAr: c?.nameAr ?? null,
        companyNameEn: c?.nameEn ?? null,
        plan: r.plan,
        status: r.status,
        billingCycle: r.billingCycle,
        startedAt: r.startedAt,
        currentPeriodEndAt: r.currentPeriodEndAt,
        trialEndsAt: r.trialEndsAt,
        gracePeriodEndsAt: r.gracePeriodEndsAt,
        priceIqd: r.priceIqd.toString(),
        monthlyMrrIqd: monthlyMrrIqd.toFixed(2),
        deviceCount: r._count.licenseKeys,
      };
    });

    if (params.search) {
      const q = params.search.trim().toLowerCase();
      items = items.filter(
        (it) =>
          (it.companyNameAr ?? '').toLowerCase().includes(q) ||
          (it.companyNameEn ?? '').toLowerCase().includes(q) ||
          (it.companyCode ?? '').toLowerCase().includes(q),
      );
    }

    return { items, total, skip, take };
  }

  /**
   * Detailed view of a single subscription including company, plan,
   * feature overrides, and license keys.
   */
  async getTenantDetail(subscriptionId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        plan: true,
        featureOverrides: true,
        licenseKeys: {
          orderBy: { issuedAt: 'desc' },
          include: { _count: { select: { fingerprints: true } } },
        },
      },
    });
    if (!sub) {
      throw new NotFoundException({
        code: 'SUBSCRIPTION_NOT_FOUND',
        messageAr: 'الاشتراك غير موجود',
      });
    }
    const company = await this.prisma.company.findUnique({
      where: { id: sub.companyId },
      select: {
        id: true,
        code: true,
        nameAr: true,
        nameEn: true,
        email: true,
        phone: true,
      },
    });
    return { ...sub, company };
  }

  /** Activate or suspend a subscription. */
  async setStatus(
    subscriptionId: string,
    nextStatus: 'active' | 'suspended',
    reason: string | undefined,
    session: UserSession,
  ) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!sub) {
      throw new NotFoundException({
        code: 'SUBSCRIPTION_NOT_FOUND',
        messageAr: 'الاشتراك غير موجود',
      });
    }

    if (nextStatus === sub.status) {
      throw new BadRequestException({
        code: 'STATUS_UNCHANGED',
        messageAr: 'الحالة غير متغيّرة',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: nextStatus },
      });
      await tx.licenseEvent.create({
        data: {
          subscriptionId,
          eventType: nextStatus === 'suspended' ? 'suspended' : 'resumed',
          payload: { from: sub.status, to: nextStatus, reason: reason ?? null },
          createdBy: session.userId,
        },
      });
      return u;
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: nextStatus === 'suspended' ? 'SUBSCRIPTION_SUSPENDED' : 'SUBSCRIPTION_ACTIVATED',
      entityType: 'Subscription',
      entityId: subscriptionId,
      metadata: { from: sub.status, to: nextStatus, reason: reason ?? null },
    });

    return updated;
  }

  /**
   * Change a subscription's plan (upgrade or downgrade).
   *
   * Delegates the proration math, LicenseEvent log entries, feature-cache
   * invalidation and customer notification to T68's `PlanChangeService`.
   * The admin endpoint shape is unchanged: the same controller signature
   * still resolves to a Subscription-shaped response so the existing
   * super-admin UI keeps working.
   */
  async changePlan(
    subscriptionId: string,
    newPlanId: string,
    session: UserSession,
  ) {
    const result = await this.planChange.changePlan({
      subscriptionId,
      newPlanId,
      actorUserId: session.userId,
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action:
        result.direction === 'downgraded'
          ? 'SUBSCRIPTION_DOWNGRADED'
          : 'SUBSCRIPTION_UPGRADED',
      entityType: 'Subscription',
      entityId: subscriptionId,
      metadata: {
        fromPlanId: null, // captured in the LicenseEvent payload
        toPlanId: newPlanId,
        netDeltaIqd: result.netDeltaIqd,
        direction: result.direction,
      },
    });

    return result.subscription;
  }

  /** Manually extend the trial period on a subscription. */
  async extendTrial(
    subscriptionId: string,
    extraDays: number,
    session: UserSession,
  ) {
    if (!Number.isInteger(extraDays) || extraDays <= 0 || extraDays > 365) {
      throw new BadRequestException({
        code: 'INVALID_EXTRA_DAYS',
        messageAr: 'عدد الأيام يجب أن يكون بين 1 و 365',
      });
    }
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!sub) {
      throw new NotFoundException({
        code: 'SUBSCRIPTION_NOT_FOUND',
        messageAr: 'الاشتراك غير موجود',
      });
    }

    const base = sub.trialEndsAt ?? new Date();
    const nextTrialEnd = new Date(
      base.getTime() + extraDays * 24 * 60 * 60 * 1000,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          trialEndsAt: nextTrialEnd,
          status: sub.status === 'expired' ? 'trial' : sub.status,
        },
      });
      await tx.licenseEvent.create({
        data: {
          subscriptionId,
          eventType: 'trial_extended',
          payload: {
            previousTrialEndsAt: sub.trialEndsAt,
            newTrialEndsAt: nextTrialEnd,
            extraDays,
          },
          createdBy: session.userId,
        },
      });
      return u;
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'SUBSCRIPTION_TRIAL_EXTENDED',
      entityType: 'Subscription',
      entityId: subscriptionId,
      metadata: { extraDays, newTrialEndsAt: nextTrialEnd.toISOString() },
    });

    return updated;
  }

  /** Read-only list of all plans + features (for the Plans page). */
  async listPlans() {
    return this.prisma.plan.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { features: true },
    });
  }

  /** Paginated audit log of license events across all subscriptions. */
  async listEvents(params: { skip?: number; take?: number; subscriptionId?: string }) {
    const take = Math.min(Math.max(params.take ?? 50, 1), 200);
    const skip = Math.max(params.skip ?? 0, 0);
    const where: any = {};
    if (params.subscriptionId) where.subscriptionId = params.subscriptionId;

    const [total, items] = await Promise.all([
      this.prisma.licenseEvent.count({ where }),
      this.prisma.licenseEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    return { items, total, skip, take };
  }
}
