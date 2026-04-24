import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PayGradesService } from './pay-grades.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('hr/pay-grades')
export class PayGradesController {
  constructor(private readonly svc: PayGradesService) {}

  @Post()
  @RequirePermission('PayGrade', 'create')
  create(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.create(dto, user);
  }

  @Get()
  @RequirePermission('PayGrade', 'read')
  findAll(@CurrentUser() user: UserSession) {
    return this.svc.findAll(user.companyId);
  }

  @Get(':id')
  @RequirePermission('PayGrade', 'read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.findOne(id, user.companyId);
  }

  @Patch(':id')
  @RequirePermission('PayGrade', 'update')
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('PayGrade', 'delete')
  remove(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.remove(id, user);
  }

  @Get('employees/:employeeId/annual-increase')
  @RequirePermission('PayGrade', 'read')
  computeIncrease(@Param('employeeId') employeeId: string, @CurrentUser() user: UserSession) {
    return this.svc.computeAnnualIncrease(employeeId, user.companyId);
  }
}
