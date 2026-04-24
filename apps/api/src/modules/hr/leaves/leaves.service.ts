import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

const ENTITLEMENTS: Record<string, number> = {
  annual: 21,
  sick: 14,
  maternity: 98,
  emergency: 7,
  hajj: 30,
  unpaid: 365,
};

@Injectable()
export class LeavesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private daysBetween(a: Date, b: Date): number {
    const ms = this.startOfDay(b).getTime() - this.startOfDay(a).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
  }

  async request(
    dto: {
      employeeId: string;
      type: any;
      startDate: string | Date;
      endDate: string | Date;
      reason?: string;
      attachmentUrl?: string;
    },
    session: UserSession,
  ) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId: session.companyId, deletedAt: null },
    });
    if (!emp) throw new NotFoundException({ code: 'EMP_NOT_FOUND', messageAr: 'الموظف غير موجود' });

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) {
      throw new BadRequestException({ code: 'INVALID_RANGE', messageAr: 'تاريخ النهاية قبل البداية' });
    }
    const totalDays = this.daysBetween(start, end);
    const bal = await this.getBalance(dto.employeeId, session.companyId);
    const typeBal = bal[dto.type as string];
    if (typeBal && typeBal.remaining < totalDays && dto.type !== 'unpaid') {
      throw new BadRequestException({
        code: 'INSUFFICIENT_BALANCE',
        messageAr: `الرصيد غير كافٍ (${typeBal.remaining} يوم متبقي)`,
      });
    }

    const req = await this.prisma.leaveRequest.create({
      data: {
        companyId:     session.companyId,
        employeeId:    dto.employeeId,
        type:          dto.type,
        startDate:     start,
        endDate:       end,
        totalDays:     new Prisma.Decimal(totalDays),
        reason:        dto.reason,
        status:        'submitted',
        attachmentUrl: dto.attachmentUrl,
        createdBy:     session.userId,
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'REQUEST',
      entity: 'LeaveRequest',
      entityId: req.id,
      after: req,
    });
    return req;
  }

  async approve(requestId: string, session: UserSession) {
    const req = await this.prisma.leaveRequest.findFirst({
      where: { id: requestId, companyId: session.companyId },
    });
    if (!req) throw new NotFoundException({ code: 'LEAVE_NOT_FOUND', messageAr: 'الطلب غير موجود' });
    if (req.status !== 'submitted') {
      throw new BadRequestException({ code: 'INVALID_STATUS', messageAr: 'حالة الطلب لا تسمح بالموافقة' });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id: requestId },
        data: { status: 'approved', approvedBy: session.userId },
      });
      const cur = new Date(req.startDate);
      const end = new Date(req.endDate);
      while (cur <= end) {
        const day = this.startOfDay(cur);
        const existing = await tx.attendanceRecord.findFirst({
          where: { companyId: session.companyId, employeeId: req.employeeId, date: day },
        });
        if (existing) {
          await tx.attendanceRecord.update({
            where: { id: existing.id },
            data: { isLeave: true, leaveRequestId: req.id, isAbsent: false },
          });
        } else {
          await tx.attendanceRecord.create({
            data: {
              companyId: session.companyId,
              employeeId: req.employeeId,
              date: day,
              checkInSource: 'manual' as any,
              hoursWorked: new Prisma.Decimal(0),
              lateMinutes: 0,
              overtimeMinutes: 0,
              isAbsent: false,
              isLeave: true,
              leaveRequestId: req.id,
            },
          });
        }
        cur.setDate(cur.getDate() + 1);
      }
      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'APPROVE',
        entity: 'LeaveRequest',
        entityId: requestId,
        before: req,
        after: updated,
      });
      return updated;
    });
  }

  async reject(requestId: string, reason: string, session: UserSession) {
    const req = await this.prisma.leaveRequest.findFirst({
      where: { id: requestId, companyId: session.companyId },
    });
    if (!req) throw new NotFoundException({ code: 'LEAVE_NOT_FOUND', messageAr: 'الطلب غير موجود' });
    if (req.status !== 'submitted') {
      throw new BadRequestException({ code: 'INVALID_STATUS', messageAr: 'حالة الطلب لا تسمح بالرفض' });
    }
    const updated = await this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'rejected', rejectedBy: session.userId, reason: reason || req.reason },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'REJECT',
      entity: 'LeaveRequest',
      entityId: requestId,
      before: req,
      after: updated,
      metadata: { reason },
    });
    return updated;
  }

  async cancel(requestId: string, session: UserSession) {
    const req = await this.prisma.leaveRequest.findFirst({
      where: { id: requestId, companyId: session.companyId },
    });
    if (!req) throw new NotFoundException({ code: 'LEAVE_NOT_FOUND', messageAr: 'الطلب غير موجود' });
    if (req.status !== 'approved') {
      throw new BadRequestException({ code: 'INVALID_STATUS', messageAr: 'يمكن إلغاء الطلبات المعتمدة فقط' });
    }
    if (new Date(req.startDate) <= new Date()) {
      throw new BadRequestException({ code: 'CANNOT_CANCEL_PAST', messageAr: 'لا يمكن إلغاء إجازة بدأت' });
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id: requestId },
        data: { status: 'cancelled' },
      });
      await tx.attendanceRecord.updateMany({
        where: { leaveRequestId: requestId },
        data: { isLeave: false, leaveRequestId: null },
      });
      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'CANCEL',
        entity: 'LeaveRequest',
        entityId: requestId,
        before: req,
        after: updated,
      });
      return updated;
    });
  }

  async getBalance(employeeId: string, companyId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
    });
    if (!emp) throw new NotFoundException({ code: 'EMP_NOT_FOUND', messageAr: 'الموظف غير موجود' });
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd = new Date(new Date().getFullYear() + 1, 0, 1);
    const approved = await this.prisma.leaveRequest.findMany({
      where: {
        companyId,
        employeeId,
        status: 'approved',
        startDate: { gte: yearStart, lt: yearEnd },
      },
    });
    const result: Record<string, { entitled: number; used: number; remaining: number }> = {};
    for (const [type, entitled] of Object.entries(ENTITLEMENTS)) {
      const used = approved.filter((r) => r.type === (type as any)).reduce((s, r) => s + Number(r.totalDays), 0);
      result[type] = { entitled, used, remaining: Math.max(0, entitled - used) };
    }
    return result;
  }

  async pendingApprovals(managerId: string, companyId: string) {
    const reports = await this.prisma.employee.findMany({
      where: { companyId, managerId, deletedAt: null },
      select: { id: true },
    });
    const ids = reports.map((r) => r.id);
    if (ids.length === 0) return [];
    return this.prisma.leaveRequest.findMany({
      where: { companyId, employeeId: { in: ids }, status: 'submitted' },
      orderBy: { startDate: 'asc' },
    });
  }

  async findAll(companyId: string, filters?: { employeeId?: string; status?: any; type?: any }) {
    return this.prisma.leaveRequest.findMany({
      where: {
        companyId,
        ...(filters?.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.type ? { type: filters.type } : {}),
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const rec = await this.prisma.leaveRequest.findFirst({ where: { id, companyId } });
    if (!rec) throw new NotFoundException({ code: 'LEAVE_NOT_FOUND', messageAr: 'الطلب غير موجود' });
    return rec;
  }
}
