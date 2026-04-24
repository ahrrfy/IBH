import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

const WORKDAY_MINUTES = 480;
const DEFAULT_START_HOUR = 8;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async recordCheckIn(
    dto: { employeeId: string; source: any; lat?: number; lng?: number },
    session: UserSession,
  ) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId: session.companyId, deletedAt: null },
    });
    if (!emp) {
      throw new NotFoundException({ code: 'EMP_NOT_FOUND', messageAr: 'الموظف غير موجود' });
    }

    if (dto.source === 'mobile_geofence' && dto.lat !== undefined && dto.lng !== undefined) {
      const branch = await (this.prisma as any).branch.findFirst({ where: { id: emp.branchId } });
      if (branch?.latitude && branch?.longitude) {
        const d = this.distanceMeters(
          Number(dto.lat),
          Number(dto.lng),
          Number(branch.latitude),
          Number(branch.longitude),
        );
        if (d > 500) {
          throw new BadRequestException({
            code: 'GEOFENCE_VIOLATION',
            messageAr: `خارج نطاق الفرع (${Math.round(d)}م)`,
          });
        }
      }
    }

    const today = this.startOfDay(new Date());
    const now = new Date();
    const existing = await this.prisma.attendanceRecord.findFirst({
      where: { companyId: session.companyId, employeeId: dto.employeeId, date: today },
    });

    let record;
    if (existing) {
      if (existing.checkInAt) {
        throw new BadRequestException({ code: 'ALREADY_CHECKED_IN', messageAr: 'تم تسجيل الحضور مسبقاً اليوم' });
      }
      record = await this.prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          checkInAt: now,
          checkInSource: dto.source,
          checkInLat: dto.lat !== undefined ? new Prisma.Decimal(dto.lat) : null,
          checkInLng: dto.lng !== undefined ? new Prisma.Decimal(dto.lng) : null,
        },
      });
    } else {
      record = await this.prisma.attendanceRecord.create({
        data: {
          companyId: session.companyId,
          employeeId: dto.employeeId,
          date: today,
          checkInAt: now,
          checkInSource: dto.source,
          checkInLat: dto.lat !== undefined ? new Prisma.Decimal(dto.lat) : null,
          checkInLng: dto.lng !== undefined ? new Prisma.Decimal(dto.lng) : null,
          hoursWorked: new Prisma.Decimal(0),
          lateMinutes: 0,
          overtimeMinutes: 0,
          isAbsent: false,
          isLeave: false,
        },
      });
    }

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'CHECK_IN',
      entity: 'AttendanceRecord',
      entityId: record.id,
      after: record,
    });
    return record;
  }

  async recordCheckOut(dto: { employeeId: string }, session: UserSession) {
    const today = this.startOfDay(new Date());
    const now = new Date();
    const rec = await this.prisma.attendanceRecord.findFirst({
      where: { companyId: session.companyId, employeeId: dto.employeeId, date: today },
    });
    if (!rec || !rec.checkInAt) {
      throw new BadRequestException({ code: 'NO_CHECK_IN', messageAr: 'لم يتم تسجيل الحضور' });
    }
    if (rec.checkOutAt) {
      throw new BadRequestException({ code: 'ALREADY_CHECKED_OUT', messageAr: 'تم تسجيل الانصراف مسبقاً' });
    }
    const checkIn = new Date(rec.checkInAt);
    const scheduledStart = new Date(today);
    scheduledStart.setHours(DEFAULT_START_HOUR, 0, 0, 0);
    const lateMinutes = Math.max(0, Math.floor((checkIn.getTime() - scheduledStart.getTime()) / 60000));
    const totalMin = Math.max(0, Math.floor((now.getTime() - checkIn.getTime()) / 60000));
    const hoursWorked = totalMin / 60;
    const overtimeMinutes = Math.max(0, totalMin - WORKDAY_MINUTES);

    const updated = await this.prisma.attendanceRecord.update({
      where: { id: rec.id },
      data: {
        checkOutAt: now,
        hoursWorked: new Prisma.Decimal(hoursWorked.toFixed(2)),
        lateMinutes,
        overtimeMinutes,
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'CHECK_OUT',
      entity: 'AttendanceRecord',
      entityId: rec.id,
      before: rec,
      after: updated,
    });
    return updated;
  }

  async manualEntry(
    dto: { employeeId: string; date: string | Date; checkIn: string | Date; checkOut: string | Date; reason: string },
    session: UserSession,
  ) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId: session.companyId },
    });
    if (!emp) throw new NotFoundException({ code: 'EMP_NOT_FOUND', messageAr: 'الموظف غير موجود' });

    const date = this.startOfDay(new Date(dto.date));
    const checkInAt = new Date(dto.checkIn);
    const checkOutAt = new Date(dto.checkOut);
    if (checkOutAt <= checkInAt) {
      throw new BadRequestException({ code: 'INVALID_RANGE', messageAr: 'وقت الانصراف يجب أن يكون بعد الحضور' });
    }
    const totalMin = Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 60000);
    const scheduledStart = new Date(date);
    scheduledStart.setHours(DEFAULT_START_HOUR, 0, 0, 0);
    const lateMinutes = Math.max(0, Math.floor((checkInAt.getTime() - scheduledStart.getTime()) / 60000));
    const overtimeMinutes = Math.max(0, totalMin - WORKDAY_MINUTES);

    const existing = await this.prisma.attendanceRecord.findFirst({
      where: { companyId: session.companyId, employeeId: dto.employeeId, date },
    });
    const data: any = {
      checkInAt,
      checkOutAt,
      checkInSource: 'manual' as any,
      hoursWorked: new Prisma.Decimal((totalMin / 60).toFixed(2)),
      lateMinutes,
      overtimeMinutes,
      isAbsent: false,
    };

    let rec;
    if (existing) {
      rec = await this.prisma.attendanceRecord.update({ where: { id: existing.id }, data });
    } else {
      rec = await this.prisma.attendanceRecord.create({
        data: {
          companyId: session.companyId,
          employeeId: dto.employeeId,
          date,
          ...data,
          isLeave: false,
        },
      });
    }
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'MANUAL_ATTENDANCE',
      entity: 'AttendanceRecord',
      entityId: rec.id,
      after: rec,
      metadata: { reason: dto.reason, approvedBy: session.userId },
    });
    return rec;
  }

  async markAbsent(employeeId: string, date: string | Date, session: UserSession) {
    const day = this.startOfDay(new Date(date));
    const existing = await this.prisma.attendanceRecord.findFirst({
      where: { companyId: session.companyId, employeeId, date: day },
    });
    let rec;
    if (existing) {
      rec = await this.prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: { isAbsent: true, hoursWorked: new Prisma.Decimal(0), lateMinutes: 0, overtimeMinutes: 0 },
      });
    } else {
      rec = await this.prisma.attendanceRecord.create({
        data: {
          companyId: session.companyId,
          employeeId,
          date: day,
          checkInSource: 'manual' as any,
          hoursWorked: new Prisma.Decimal(0),
          lateMinutes: 0,
          overtimeMinutes: 0,
          isAbsent: true,
          isLeave: false,
        },
      });
    }
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'MARK_ABSENT',
      entity: 'AttendanceRecord',
      entityId: rec.id,
      after: rec,
    });
    return rec;
  }

  async syncFromZkTeco(
    records: { deviceUserId: string; timestamp: string | Date; type: 'in' | 'out' }[],
    session: UserSession,
  ) {
    const results: any[] = [];
    for (const r of records) {
      const emp = await this.prisma.employee.findFirst({
        where: { companyId: session.companyId, employeeNumber: r.deviceUserId, deletedAt: null },
      });
      if (!emp) {
        results.push({ deviceUserId: r.deviceUserId, status: 'skipped', reason: 'employee_not_found' });
        continue;
      }
      const ts = new Date(r.timestamp);
      const day = this.startOfDay(ts);
      const existing = await this.prisma.attendanceRecord.findFirst({
        where: { companyId: session.companyId, employeeId: emp.id, date: day },
      });
      if (r.type === 'in') {
        if (existing?.checkInAt) {
          results.push({ deviceUserId: r.deviceUserId, status: 'skipped', reason: 'already_in' });
          continue;
        }
        if (existing) {
          await this.prisma.attendanceRecord.update({
            where: { id: existing.id },
            data: { checkInAt: ts, checkInSource: 'zkteco' as any },
          });
        } else {
          await this.prisma.attendanceRecord.create({
            data: {
              companyId: session.companyId,
              employeeId: emp.id,
              date: day,
              checkInAt: ts,
              checkInSource: 'zkteco' as any,
              hoursWorked: new Prisma.Decimal(0),
              lateMinutes: 0,
              overtimeMinutes: 0,
              isAbsent: false,
              isLeave: false,
            },
          });
        }
        results.push({ deviceUserId: r.deviceUserId, status: 'in_recorded' });
      } else {
        if (!existing?.checkInAt) {
          results.push({ deviceUserId: r.deviceUserId, status: 'skipped', reason: 'no_check_in' });
          continue;
        }
        const totalMin = Math.floor((ts.getTime() - new Date(existing.checkInAt).getTime()) / 60000);
        const scheduledStart = new Date(day);
        scheduledStart.setHours(DEFAULT_START_HOUR, 0, 0, 0);
        const lateMinutes = Math.max(0, Math.floor((new Date(existing.checkInAt).getTime() - scheduledStart.getTime()) / 60000));
        const overtimeMinutes = Math.max(0, totalMin - WORKDAY_MINUTES);
        await this.prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            checkOutAt: ts,
            hoursWorked: new Prisma.Decimal((totalMin / 60).toFixed(2)),
            lateMinutes,
            overtimeMinutes,
          },
        });
        results.push({ deviceUserId: r.deviceUserId, status: 'out_recorded' });
      }
    }
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'ZKTECO_SYNC',
      entity: 'AttendanceRecord',
      metadata: { count: records.length, results: results.length },
    });
    return { processed: records.length, results };
  }

  async monthlyReport(companyId: string, params: { employeeId?: string; year: number; month: number }) {
    const start = new Date(params.year, params.month - 1, 1);
    const end = new Date(params.year, params.month, 1);
    const where: Prisma.AttendanceRecordWhereInput = {
      companyId,
      date: { gte: start, lt: end },
      ...(params.employeeId ? { employeeId: params.employeeId } : {}),
    };
    const records = await this.prisma.attendanceRecord.findMany({ where });
    if (params.employeeId) {
      const daysPresent = records.filter((r) => r.checkInAt && !r.isAbsent && !r.isLeave).length;
      const daysAbsent = records.filter((r) => r.isAbsent).length;
      const daysLeave = records.filter((r) => r.isLeave).length;
      const totalHours = records.reduce((s, r) => s + Number(r.hoursWorked || 0), 0);
      const totalLate = records.reduce((s, r) => s + (r.lateMinutes || 0), 0);
      const totalOvertime = records.reduce((s, r) => s + (r.overtimeMinutes || 0), 0);
      return {
        employeeId: params.employeeId,
        year: params.year,
        month: params.month,
        daysPresent,
        daysAbsent,
        daysLeave,
        totalHours,
        totalLateMinutes: totalLate,
        totalOvertimeMinutes: totalOvertime,
        records,
      };
    }
    const byEmp = new Map<string, any>();
    for (const r of records) {
      if (!byEmp.has(r.employeeId)) {
        byEmp.set(r.employeeId, {
          employeeId: r.employeeId,
          daysPresent: 0,
          daysAbsent: 0,
          daysLeave: 0,
          totalHours: 0,
          totalLate: 0,
          totalOvertime: 0,
        });
      }
      const row = byEmp.get(r.employeeId);
      if (r.checkInAt && !r.isAbsent && !r.isLeave) row.daysPresent++;
      if (r.isAbsent) row.daysAbsent++;
      if (r.isLeave) row.daysLeave++;
      row.totalHours += Number(r.hoursWorked || 0);
      row.totalLate += r.lateMinutes || 0;
      row.totalOvertime += r.overtimeMinutes || 0;
    }
    return { year: params.year, month: params.month, byEmployee: Array.from(byEmp.values()) };
  }
}
