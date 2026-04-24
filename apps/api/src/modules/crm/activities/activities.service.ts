import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import type { UserSession } from '@erp/shared-types';

type ActivityType = 'call' | 'email' | 'meeting' | 'whatsapp' | 'note';

@Injectable()
export class ActivitiesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(
    dto: { leadId: string; type: ActivityType; subject?: string; body?: string; scheduledAt?: Date | string },
    session: UserSession,
  ) {
    const lead = await this.prisma.lead.findFirst({ where: { id: dto.leadId, companyId: session.companyId } });
    if (!lead) throw new NotFoundException({ code: 'LEAD_NOT_FOUND', messageAr: 'العميل المحتمل غير موجود' });

    const activity = await this.prisma.leadActivity.create({
      data: {
        leadId:      dto.leadId,
        type:        dto.type,
        subject:     dto.subject,
        body:        dto.body,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        createdBy:   session.userId,
      },
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'LEAD_ACTIVITY_CREATED',
      entityType: 'LeadActivity',
      entityId: activity.id,
      metadata: { leadId: dto.leadId, type: dto.type },
    });
    return activity;
  }

  async complete(activityId: string, dto: { outcome?: string }, session: UserSession) {
    const activity = await this.prisma.leadActivity.findUnique({
      where: { id: activityId },
      include: { lead: true },
    });
    if (!activity || activity.lead.companyId !== session.companyId) {
      throw new NotFoundException({ code: 'ACTIVITY_NOT_FOUND', messageAr: 'النشاط غير موجود' });
    }
    if (activity.completedAt) {
      throw new BadRequestException({ code: 'ACTIVITY_ALREADY_COMPLETED', messageAr: 'النشاط مكتمل بالفعل' });
    }
    const updated = await this.prisma.leadActivity.update({
      where: { id: activityId },
      data: { completedAt: new Date(), outcome: dto.outcome },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'LEAD_ACTIVITY_COMPLETED',
      entityType: 'LeadActivity',
      entityId: activityId,
      metadata: { outcome: dto.outcome },
    });
    return updated;
  }

  async findByLead(leadId: string, companyId: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, companyId } });
    if (!lead) throw new NotFoundException({ code: 'LEAD_NOT_FOUND', messageAr: 'العميل المحتمل غير موجود' });
    return this.prisma.leadActivity.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upcomingReminders(userId: string, companyId: string) {
    return this.prisma.leadActivity.findMany({
      where: {
        completedAt: null,
        scheduledAt: { gt: new Date() },
        lead: { companyId, assignedTo: userId },
      },
      include: { lead: { select: { id: true, nameAr: true, phone: true } } },
      orderBy: { scheduledAt: 'asc' },
    });
  }
}
