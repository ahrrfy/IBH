import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('hr/employees')
export class EmployeesController {
  constructor(private readonly svc: EmployeesService) {}

  @Post()
  @RequirePermission('Employee', 'create')
  create(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.onboard(dto, user);
  }

  @Post('onboard')
  @RequirePermission('Employee', 'create')
  onboard(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.onboard(dto, user);
  }

  @Get()
  @RequirePermission('Employee', 'read')
  findAll(
    @CurrentUser() user: UserSession,
    @Query('status') status?: any,
    @Query('departmentId') departmentId?: string,
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.findAll(user.companyId, { status, departmentId, branchId, search });
  }

  @Get('tree')
  @RequirePermission('Employee', 'read')
  tree(@CurrentUser() user: UserSession) {
    return this.svc.getTree(user.companyId);
  }

  @Get('birthdays-this-month')
  @RequirePermission('Employee', 'read')
  birthdays(@CurrentUser() user: UserSession) {
    return this.svc.birthdaysThisMonth(user.companyId);
  }

  @Get('contracts-expiring')
  @RequirePermission('Employee', 'read')
  expiring(@CurrentUser() user: UserSession, @Query('days') days?: string) {
    return this.svc.contractsExpiringSoon(user.companyId, days ? Number(days) : 30);
  }

  @Get(':id')
  @RequirePermission('Employee', 'read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.findOne(id, user.companyId);
  }

  @Patch(':id')
  @RequirePermission('Employee', 'update')
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.update(id, dto, user);
  }

  @Post(':id/terminate')
  @RequirePermission('Employee', 'approve')
  terminate(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.terminate(id, dto, user);
  }

  @Post(':id/salary-adjustment')
  @RequirePermission('Employee', 'approve')
  salaryAdjust(@Param('id') id: string, @Body() dto: { newBase: number | string; reason: string }, @CurrentUser() user: UserSession) {
    return this.svc.salaryAdjustment(id, dto.newBase, dto.reason, user);
  }

  @Post(':id/documents')
  @RequirePermission('Employee', 'update')
  uploadDoc(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.uploadDocument(id, dto, user);
  }
}
