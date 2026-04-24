import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { JobOrdersService } from './job-orders.service';
import { CurrentUser } from '../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('job-orders')
export class JobOrdersController {
  constructor(private readonly svc: JobOrdersService) {}

  @Post()
  @RequirePermission('JobOrder', 'create')
  create(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.createQuotation(dto, user);
  }

  @Get()
  @RequirePermission('JobOrder', 'read')
  findAll(
    @CurrentUser() user: UserSession,
    @Query('status') status?: any,
    @Query('customerId') customerId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.svc.findAll(user.companyId, { status, customerId, branchId });
  }

  @Get(':id')
  @RequirePermission('JobOrder', 'read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.findOne(id, user.companyId);
  }

  @Get(':id/bom')
  @RequirePermission('JobOrder', 'read')
  bom(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.getBomLines(id, user.companyId);
  }

  @Get(':id/stages')
  @RequirePermission('JobOrder', 'read')
  stages(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.getStages(id, user.companyId);
  }

  @Post(':id/approve-quotation')
  @RequirePermission('JobOrder', 'approve')
  approveQ(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.approveQuotation(id, user);
  }

  @Post(':id/confirm-design')
  @RequirePermission('JobOrder', 'approve')
  confirm(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.confirmDesign(id, user);
  }

  @Post(':id/start-production')
  @RequirePermission('JobOrder', 'update')
  start(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.startProduction(id, user);
  }

  @Post(':id/stages/:stageId/complete')
  @RequirePermission('JobOrder', 'update')
  complete(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body() dto: { notes?: string },
    @CurrentUser() user: UserSession,
  ) {
    return this.svc.completeStage(id, stageId, dto?.notes, user);
  }

  @Post(':id/mark-ready')
  @RequirePermission('JobOrder', 'update')
  ready(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.markReady(id, user);
  }

  @Post(':id/deliver')
  @RequirePermission('JobOrder', 'approve')
  deliver(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.deliver(id, user);
  }

  @Post(':id/cancel')
  @RequirePermission('JobOrder', 'approve')
  cancel(@Param('id') id: string, @Body() dto: { reason: string }, @CurrentUser() user: UserSession) {
    return this.svc.cancel(id, dto.reason, user);
  }
}
