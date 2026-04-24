import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(
    dto: {
      source?: string;
      nameAr: string;
      phone?: string;
      email?: string;
      interest?: string;
      estimatedValueIqd?: number;
      assignedTo?: string;
    },
    session: UserSession,
  ) {
    if (!dto.nameAr) {
      throw new BadRequestException({ code: 'LEAD_NAME_REQUIRED', messageAr: 'اسم العميل المحتمل مطلوب' });
    }
    const lead = await this.prisma.lead.create({
      data: {
        companyId: session.companyId,
        source: dto.source ?? 'manual',
        nameAr: dto.nameAr,
        phone: dto.phone,
        email: dto.email,
        interest: dto.interest,
        estimatedValueIqd: dto.estimatedValueIqd ? new Prisma.Decimal(dto.estimatedValueIqd) : null,
        assignedTo: dto.assignedTo,
        status: 'new',
        score: 0,
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'LEAD_CREATED',
      entityType: 'Lead',
      entityId: lead.id,
      metadata: { nameAr: lead.nameAr, source: lead.source },
    });
    return lead;
  }

  async findAll(
    companyId: string,
    params: { page?: number; pageSize?: number; status?: LeadStatus; assignedTo?: string; source?: string; search?: string },
  ) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 50;
    const where: Prisma.LeadWhereInput = {
      companyId,
      ...(params.status && { status: params.status }),
      ...(params.assignedTo && { assignedTo: params.assignedTo }),
      ...(params.source && { source: params.source }),
      ...(params.search && {
        OR: [
          { nameAr: { contains: params.search, mode: 'insensitive' } },
          { phone: { contains: params.search } },
          { email: { contains: params.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async findOne(id: string, companyId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, companyId },
      include: { activities: { orderBy: { createdAt: 'desc' } } },
    });
    if (!lead) throw new NotFoundException({ code: 'LEAD_NOT_FOUND', messageAr: 'العميل المحتمل غير موجود' });
    return lead;
  }

  async update(id: string, dto: Partial<{ nameAr: string; phone: string; email: string; interest: string; estimatedValueIqd: number; source: string }>, session: UserSession) {
    const lead = await this.findOne(id, session.companyId);
    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        ...(dto.nameAr !== undefined && { nameAr: dto.nameAr }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.interest !== undefined && { interest: dto.interest }),
        ...(dto.source !== undefined && { source: dto.source }),
        ...(dto.estimatedValueIqd !== undefined && { estimatedValueIqd: new Prisma.Decimal(dto.estimatedValueIqd) }),
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'LEAD_UPDATED',
      entityType: 'Lead',
      entityId: id,
      metadata: dto,
    });
    return updated;
  }

  async changeStatus(
    id: string,
    newStatus: LeadStatus,
    session: UserSession,
    extras?: { customerId?: string; lostReason?: string },
  ) {
    const lead = await this.findOne(id, session.companyId);

    if (lead.status === 'new' && newStatus === 'contacted') {
      const activityCount = await this.prisma.leadActivity.count({ where: { leadId: id } });
      if (activityCount === 0) {
        throw new BadRequestException({ code: 'LEAD_NO_ACTIVITY', messageAr: 'يجب تسجيل نشاط واحد على الأقل قبل التحويل' });
      }
    }

    const data: Prisma.LeadUpdateInput = { status: newStatus as any };

    if (newStatus === 'won') {
      let customerId = extras?.customerId;
      if (!customerId) {
        const customer = await this.prisma.customer.create({
          data: {
            companyId: session.companyId,
            nameAr: lead.nameAr,
            phone: lead.phone,
            email: lead.email,
          } as any,
        });
        customerId = customer.id;
      }
      data.customerId = customerId;
      data.wonAt = new Date();
    }

    if (newStatus === 'lost') {
      if (!extras?.lostReason) {
        throw new BadRequestException({ code: 'LOST_REASON_REQUIRED', messageAr: 'سبب الخسارة مطلوب' });
      }
      data.lostReason = extras.lostReason;
      data.lostAt = new Date();
    }

    const updated = await this.prisma.lead.update({ where: { id }, data });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'LEAD_STATUS_CHANGED',
      entityType: 'Lead',
      entityId: id,
      metadata: { from: lead.status, to: newStatus },
    });

    await this.calculateScore(id);
    return updated;
  }

  async assign(id: string, userId: string, session: UserSession) {
    const lead = await this.findOne(id, session.companyId);
    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: { assignedTo: userId },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'LEAD_ASSIGNED',
      entityType: 'Lead',
      entityId: id,
      metadata: { assignedTo: userId },
    });
    return updated;
  }

  async calculateScore(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: { activities: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!lead) return 0;

    let score = 0;
    if (lead.phone) score += 20;
    if (lead.email) score += 10;
    if (lead.estimatedValueIqd && lead.estimatedValueIqd.gte(new Prisma.Decimal(1_000_000))) score += 15;

    const lastActivity = lead.activities[0];
    if (lastActivity) {
      const daysSince = (Date.now() - lastActivity.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) score += 20;
    }

    switch (lead.status) {
      case 'contacted': score += 10; break;
      case 'qualified': score += 20; break;
      case 'proposal': score += 15; break;
      case 'negotiation': score += 20; break;
    }

    score = Math.max(0, Math.min(100, score));
    await this.prisma.lead.update({ where: { id }, data: { score } });
    return score;
  }

  async conversionReport(companyId: string, from: Date, to: Date) {
    const grouped = await this.prisma.lead.groupBy({
      by: ['status'],
      where: { companyId, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { estimatedValueIqd: true },
    });

    const total = grouped.reduce((s, g) => s + g._count._all, 0);
    const wonCount = grouped.find((g) => g.status === 'won')?._count._all ?? 0;
    const lostCount = grouped.find((g) => g.status === 'lost')?._count._all ?? 0;

    return {
      total,
      funnel: grouped.map((g) => ({
        status: g.status,
        count: g._count._all,
        value: g._sum.estimatedValueIqd?.toNumber() ?? 0,
      })),
      conversionRate: total > 0 ? wonCount / total : 0,
      lossRate: total > 0 ? lostCount / total : 0,
    };
  }

  async topSources(companyId: string, from: Date, to: Date) {
    const rows = await this.prisma.lead.groupBy({
      by: ['source', 'status'],
      where: { companyId, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });
    const map = new Map<string, { source: string; total: number; won: number }>();
    for (const r of rows) {
      const src = r.source ?? 'unknown';
      const entry = map.get(src) ?? { source: src, total: 0, won: 0 };
      entry.total += r._count._all;
      if (r.status === 'won') entry.won += r._count._all;
      map.set(src, entry);
    }
    return Array.from(map.values())
      .map((e) => ({ ...e, wonRate: e.total > 0 ? e.won / e.total : 0 }))
      .sort((a, b) => b.total - a.total);
  }
}
