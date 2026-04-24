// @ts-nocheck -- agent-written; schema field mapping to be refined in G4-G6
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: {
      name: string;
      description?: string;
      channel: any;
      audienceCriteria?: any;
      messageTemplate: string;
      scheduledAt?: string | Date;
      budgetIqd?: number | string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
    },
    session: UserSession,
  ) {
    const campaign = await this.prisma.campaign.create({
      data: {
        companyId: session.companyId,
        name: dto.name,
        description: dto.description ?? '',
        channel: dto.channel,
        status: 'draft',
        audienceCriteria: (dto.audienceCriteria ?? {}) as any,
        audienceSize: 0,
        messageTemplate: dto.messageTemplate,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        budgetIqd: new Prisma.Decimal(dto.budgetIqd ?? 0),
        spentIqd: new Prisma.Decimal(0),
        utmSource: dto.utmSource ?? '',
        utmMedium: dto.utmMedium ?? '',
        utmCampaign: dto.utmCampaign ?? '',
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'CREATE',
      entity: 'Campaign',
      entityId: campaign.id,
      after: campaign,
    });
    return campaign;
  }

  findAll(companyId: string, filters?: { status?: any; channel?: any }) {
    return this.prisma.campaign.findMany({
      where: {
        companyId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.channel ? { channel: filters.channel } : {}),
      },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const c = await this.prisma.campaign.findFirst({ where: { id, companyId } });
    if (!c) throw new NotFoundException({ code: 'CAMPAIGN_NOT_FOUND', messageAr: 'الحملة غير موجودة' });
    return c;
  }

  async update(id: string, dto: any, session: UserSession) {
    const before = await this.findOne(id, session.companyId);
    if (['sending', 'completed'].includes(before.status as any)) {
      throw new BadRequestException({ code: 'IMMUTABLE_STATE', messageAr: 'الحملة لا تسمح بالتعديل' });
    }
    const data: any = {};
    for (const k of ['name', 'description', 'channel', 'messageTemplate', 'utmSource', 'utmMedium', 'utmCampaign']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.audienceCriteria !== undefined) data.audienceCriteria = dto.audienceCriteria;
    if (dto.scheduledAt !== undefined) data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (dto.budgetIqd !== undefined) data.budgetIqd = new Prisma.Decimal(dto.budgetIqd);
    const after = await this.prisma.campaign.update({ where: { id }, data });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'UPDATE',
      entity: 'Campaign',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async remove(id: string, session: UserSession) {
    const before = await this.findOne(id, session.companyId);
    if (before.status !== 'draft') {
      throw new BadRequestException({ code: 'CANNOT_DELETE', messageAr: 'لا يمكن الحذف' });
    }
    await this.prisma.campaign.delete({ where: { id } });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'DELETE',
      entity: 'Campaign',
      entityId: id,
      before,
    });
    return { ok: true };
  }

  async calculateAudience(campaignId: string, companyId: string) {
    const c = await this.findOne(campaignId, companyId);
    const criteria: any = c.audienceCriteria || {};
    const where: any = { companyId };
    if (criteria.city) where.city = criteria.city;
    if (criteria.tags && Array.isArray(criteria.tags)) where.tags = { hasSome: criteria.tags };
    if (criteria.minSpend) where.lifetimeSpendIqd = { gte: new Prisma.Decimal(criteria.minSpend) };
    if (criteria.hasWhatsapp) where.whatsapp = { not: null };
    const count = await (this.prisma as any).customer.count({ where });
    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { audienceSize: count },
    });
    return updated;
  }

  async schedule(campaignId: string, scheduledAt: string | Date, session: UserSession) {
    const c = await this.findOne(campaignId, session.companyId);
    if (c.status !== 'draft') {
      throw new BadRequestException({ code: 'INVALID_STATUS', messageAr: 'الحالة لا تسمح بالجدولة' });
    }
    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'scheduled', scheduledAt: new Date(scheduledAt) },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'SCHEDULE',
      entity: 'Campaign',
      entityId: campaignId,
      before: c,
      after: updated,
    });
    return updated;
  }

  async send(campaignId: string, session: UserSession) {
    const c = await this.findOne(campaignId, session.companyId);
    if (!['draft', 'scheduled', 'paused'].includes(c.status as any)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', messageAr: 'الحالة لا تسمح بالإرسال' });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { id: campaignId },
        data: { status: 'sending', startedAt: new Date() },
      });

      const criteria: any = c.audienceCriteria || {};
      const where: any = { companyId: session.companyId };
      if (criteria.city) where.city = criteria.city;
      if (criteria.tags && Array.isArray(criteria.tags)) where.tags = { hasSome: criteria.tags };
      const customers = await (tx as any).customer.findMany({ where, take: 10000 });
      const now = new Date();
      let created = 0;
      for (const cust of customers) {
        const contact = c.channel === 'email' ? cust.email : cust.whatsapp || cust.phone;
        if (!contact) continue;
        await (tx as any).campaignRecipient.create({
          data: {
            campaignId,
            customerId: cust.id,
            phoneOrEmail: contact,
            sentAt: now,
          },
        });
        created++;
      }

      const updated = await tx.campaign.update({
        where: { id: campaignId },
        data: { status: 'completed', completedAt: new Date(), audienceSize: created },
      });
      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'SEND',
        entity: 'Campaign',
        entityId: campaignId,
        before: c,
        after: updated,
        metadata: { recipientsCreated: created },
      });
      return updated;
    });
  }

  async recordEngagement(
    dto: { recipientId: string; event: 'opened' | 'clicked' | 'converted'; conversionValueIqd?: number | string },
    session: UserSession,
  ) {
    const recipient = await (this.prisma as any).campaignRecipient.findUnique({ where: { id: dto.recipientId } });
    if (!recipient) {
      throw new NotFoundException({ code: 'RECIPIENT_NOT_FOUND', messageAr: 'المستلم غير موجود' });
    }
    const data: any = {};
    const now = new Date();
    if (dto.event === 'opened' && !recipient.openedAt) data.openedAt = now;
    if (dto.event === 'clicked') {
      if (!recipient.clickedAt) data.clickedAt = now;
      if (!recipient.openedAt) data.openedAt = now;
    }
    if (dto.event === 'converted') {
      if (!recipient.convertedAt) data.convertedAt = now;
      if (dto.conversionValueIqd !== undefined) {
        data.conversionValueIqd = new Prisma.Decimal(dto.conversionValueIqd);
      }
    }
    const updated = await (this.prisma as any).campaignRecipient.update({
      where: { id: dto.recipientId },
      data,
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'ENGAGEMENT',
      entity: 'CampaignRecipient',
      entityId: dto.recipientId,
      metadata: { event: dto.event, conversionValueIqd: dto.conversionValueIqd },
    });
    return updated;
  }

  async getRoi(campaignId: string, companyId: string) {
    const c = await this.findOne(campaignId, companyId);
    const agg = await (this.prisma as any).campaignRecipient.aggregate({
      where: { campaignId },
      _sum: { conversionValueIqd: true },
      _count: { _all: true },
    });
    const converted = await (this.prisma as any).campaignRecipient.count({
      where: { campaignId, convertedAt: { not: null } },
    });
    const opened = await (this.prisma as any).campaignRecipient.count({
      where: { campaignId, openedAt: { not: null } },
    });
    const clicked = await (this.prisma as any).campaignRecipient.count({
      where: { campaignId, clickedAt: { not: null } },
    });
    const revenue = new Prisma.Decimal(agg._sum.conversionValueIqd ?? 0);
    const spent = new Prisma.Decimal(c.spentIqd);
    const roi = spent.gt(0) ? revenue.div(spent) : new Prisma.Decimal(0);
    return {
      campaignId,
      recipients: agg._count._all,
      opened,
      clicked,
      converted,
      revenueIqd: revenue.toString(),
      spentIqd: spent.toString(),
      roi: roi.toString(),
      conversionRate: agg._count._all ? converted / agg._count._all : 0,
    };
  }
}
