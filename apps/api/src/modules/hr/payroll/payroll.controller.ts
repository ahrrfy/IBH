import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('hr/payroll')
export class PayrollController {
  constructor(private readonly svc: PayrollService) {}

  @Post('runs')
  @RequirePermission('PayrollRun', 'create')
  create(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.createRun(dto, user);
  }

  @Get('runs')
  @RequirePermission('PayrollRun', 'read')
  findAll(
    @CurrentUser() user: UserSession,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('status') status?: any,
  ) {
    return this.svc.findAll(user.companyId, {
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      status,
    });
  }

  @Get('runs/:id')
  @RequirePermission('PayrollRun', 'read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.findOne(id, user.companyId);
  }

  @Get('runs/:id/lines')
  @RequirePermission('PayrollRun', 'read')
  lines(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.getLines(id, user.companyId);
  }

  @Post('runs/:id/review')
  @RequirePermission('PayrollRun', 'approve')
  review(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.review(id, user);
  }

  @Post('runs/:id/approve')
  @RequirePermission('PayrollRun', 'approve')
  approve(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.approve(id, user);
  }

  @Post('runs/:id/post')
  @RequirePermission('PayrollRun', 'approve')
  post(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.post(id, user);
  }

  @Post('runs/:id/mark-paid')
  @RequirePermission('PayrollRun', 'approve')
  markPaid(@Param('id') id: string, @Body() dto: { paymentDate: string }, @CurrentUser() user: UserSession) {
    return this.svc.markPaid(id, dto.paymentDate, user);
  }

  @Post('runs/:id/reverse')
  @RequirePermission('PayrollRun', 'approve')
  reverse(@Param('id') id: string, @Body() dto: { reason: string }, @CurrentUser() user: UserSession) {
    return this.svc.reverse(id, dto.reason, user);
  }

  @Get('runs/:id/export-cbs')
  @RequirePermission('PayrollRun', 'read')
  exportCbs(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.exportCbsFile(id, user.companyId);
  }
}
