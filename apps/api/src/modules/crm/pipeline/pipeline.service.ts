import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { LeadsService } from '../leads/leads.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

const PROBABILITIES: Record<LeadStatus, number> = {
  new: 0.1,
  contacted: 0.2,
  qualified: 0.4,
  proposal: 0.6,
  negotiation: 0.8,
  won: 1.0,
  lost: 0,
};

const STAGE_ORDER: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

@Injectable()
export class PipelineService {
  constructor(private prisma: PrismaService, private audit: AuditService, private leads: LeadsService) {}

  async pipelineView(companyId: string, params: { filter?: string; assignedTo?: string }) {
    const where: Prisma.LeadWhereInput = {
      companyId,
      ...(params.assignedTo && { assignedTo: params.assignedTo }),
      ...(params.filter && {
        OR: [
          { nameAr: { contains: params.filter, mode: 'insensitive' } },
          { phone: { contains: params.filter } },
        ],
      }),
    };
    const leads = await this.prisma.lead.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    const stages = STAGE_ORDER.map((status) => {
      const stageLeads = leads.filter((l) => l.status === status);
      const totalValueIqd = stageLeads.reduce(
        (s, l) => s + (l.estimatedValueIqd ? l.estimatedValueIqd.toNumber() : 0),
        0,
      );
      return { status, leads: stageLeads, count: stageLeads.length, totalValueIqd };
    });

    return { stages };
  }

  async moveLead(leadId: string, toStatus: LeadStatus, session: UserSession, extras?: { customerId?: string; lostReason?: string }) {
    return this.leads.changeStatus(leadId, toStatus, session, extras);
  }

  async forecast(companyId: string, periodMonths: number = 3) {
    const horizonEnd = new Date();
    horizonEnd.setMonth(horizonEnd.getMonth() + periodMonths);

    const openLeads = await this.prisma.lead.findMany({
      where: {
        companyId,
        status: { notIn: ['won', 'lost'] as any },
      },
    });

    let expectedRevenue = 0;
    const byStatus: Record<string, { count: number; expectedRevenue: number }> = {};

    for (const lead of openLeads) {
      const status = lead.status as LeadStatus;
      const value = lead.estimatedValueIqd ? lead.estimatedValueIqd.toNumber() : 0;
      const prob = PROBABILITIES[status] ?? 0;
      const contribution = value * prob;
      expectedRevenue += contribution;
      if (!byStatus[status]) byStatus[status] = { count: 0, expectedRevenue: 0 };
      byStatus[status].count += 1;
      byStatus[status].expectedRevenue += contribution;
    }

    return {
      periodMonths,
      openLeadsCount: openLeads.length,
      expectedRevenue,
      byStatus,
    };
  }
}
