import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('hr/attendance')
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  @Post('check-in')
  @RequirePermission('Attendance', 'create')
  checkIn(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.recordCheckIn(dto, user);
  }

  @Post('check-out')
  @RequirePermission('Attendance', 'create')
  checkOut(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.recordCheckOut(dto, user);
  }

  @Post('manual-entry')
  @RequirePermission('Attendance', 'approve')
  manualEntry(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.manualEntry(dto, user);
  }

  @Post('mark-absent')
  @RequirePermission('Attendance', 'approve')
  markAbsent(@Body() dto: { employeeId: string; date: string }, @CurrentUser() user: UserSession) {
    return this.svc.markAbsent(dto.employeeId, dto.date, user);
  }

  @Post('sync-zkteco')
  @RequirePermission('Attendance', 'create')
  syncZk(@Body() dto: { records: any[] }, @CurrentUser() user: UserSession) {
    return this.svc.syncFromZkTeco(dto.records, user);
  }

  @Get('report/monthly')
  @RequirePermission('Attendance', 'read')
  monthly(
    @CurrentUser() user: UserSession,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.svc.monthlyReport(user.companyId, { employeeId, year: Number(year), month: Number(month) });
  }
}
