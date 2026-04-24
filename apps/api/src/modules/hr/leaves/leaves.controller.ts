import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { LeavesService } from './leaves.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('hr/leaves')
export class LeavesController {
  constructor(private readonly svc: LeavesService) {}

  @Post()
  @RequirePermission('LeaveRequest', 'create')
  request(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.request(dto, user);
  }

  @Get()
  @RequirePermission('LeaveRequest', 'read')
  findAll(
    @CurrentUser() user: UserSession,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: any,
    @Query('type') type?: any,
  ) {
    return this.svc.findAll(user.companyId, { employeeId, status, type });
  }

  @Get('pending-approvals')
  @RequirePermission('LeaveRequest', 'approve')
  pending(@CurrentUser() user: UserSession) {
    return this.svc.pendingApprovals(user.userId, user.companyId);
  }

  @Get('balance/:employeeId')
  @RequirePermission('LeaveRequest', 'read')
  balance(@Param('employeeId') employeeId: string, @CurrentUser() user: UserSession) {
    return this.svc.getBalance(employeeId, user.companyId);
  }

  @Get(':id')
  @RequirePermission('LeaveRequest', 'read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.findOne(id, user.companyId);
  }

  @Post(':id/approve')
  @RequirePermission('LeaveRequest', 'approve')
  approve(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.approve(id, user);
  }

  @Post(':id/reject')
  @RequirePermission('LeaveRequest', 'approve')
  reject(@Param('id') id: string, @Body() dto: { reason: string }, @CurrentUser() user: UserSession) {
    return this.svc.reject(id, dto.reason, user);
  }

  @Post(':id/cancel')
  @RequirePermission('LeaveRequest', 'update')
  cancel(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.cancel(id, user);
  }
}
