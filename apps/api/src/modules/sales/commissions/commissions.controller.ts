import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CommissionsService } from './commissions.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('sales/commissions')
export class CommissionsController {
  constructor(private readonly svc: CommissionsService) {}

  // ─── Plans ────────────────────────────────────────────────────────────────

  @Get('plans')
  @RequirePermission('CommissionPlan', 'read')
  listPlans(@CurrentUser() user: UserSession) {
    return this.svc.listPlans(user.companyId);
  }

  @Get('plans/:id')
  @RequirePermission('CommissionPlan', 'read')
  getPlan(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.getPlan(user.companyId, id);
  }

  @Post('plans')
  @RequirePermission('CommissionPlan', 'create')
  createPlan(@CurrentUser() user: UserSession, @Body() body: unknown) {
    return this.svc.createPlan(user.companyId, body, user);
  }

  @Put('plans/:id')
  @RequirePermission('CommissionPlan', 'update')
  updatePlan(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.updatePlan(user.companyId, id, body, user);
  }

  // ─── Assignments ──────────────────────────────────────────────────────────

  @Post('assignments')
  @RequirePermission('CommissionPlan', 'update')
  assign(@CurrentUser() user: UserSession, @Body() body: unknown) {
    return this.svc.assign(user.companyId, body, user);
  }

  @Delete('assignments/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('CommissionPlan', 'update')
  unassign(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.unassign(user.companyId, id, user);
  }

  // ─── Entries ──────────────────────────────────────────────────────────────

  @Get('entries')
  @RequirePermission('CommissionEntry', 'read')
  listEntries(
    @CurrentUser() user: UserSession,
    @Query('employeeId') employeeId?: string,
    @Query('planId') planId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.listEntries(user.companyId, {
      employeeId,
      planId,
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
    });
  }

  @Get('summary/:employeeId')
  @RequirePermission('CommissionEntry', 'read')
  summary(@CurrentUser() user: UserSession, @Param('employeeId') employeeId: string) {
    return this.svc.employeeSummary(user.companyId, employeeId);
  }

  @Post('entries')
  @RequirePermission('CommissionEntry', 'create')
  manualEntry(@CurrentUser() user: UserSession, @Body() body: unknown) {
    return this.svc.createManualEntry(user.companyId, body, user);
  }
}
