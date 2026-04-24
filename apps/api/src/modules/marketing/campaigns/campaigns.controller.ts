import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('marketing/campaigns')
export class CampaignsController {
  constructor(private readonly svc: CampaignsService) {}

  @Post()
  @RequirePermission('Campaign', 'create')
  create(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.create(dto, user);
  }

  @Get()
  @RequirePermission('Campaign', 'read')
  findAll(@CurrentUser() user: UserSession, @Query('status') status?: any, @Query('channel') channel?: any) {
    return this.svc.findAll(user.companyId, { status, channel });
  }

  @Get(':id')
  @RequirePermission('Campaign', 'read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.findOne(id, user.companyId);
  }

  @Patch(':id')
  @RequirePermission('Campaign', 'update')
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('Campaign', 'delete')
  remove(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.remove(id, user);
  }

  @Post(':id/calculate-audience')
  @RequirePermission('Campaign', 'update')
  calc(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.calculateAudience(id, user.companyId);
  }

  @Post(':id/schedule')
  @RequirePermission('Campaign', 'approve')
  schedule(@Param('id') id: string, @Body() dto: { scheduledAt: string }, @CurrentUser() user: UserSession) {
    return this.svc.schedule(id, dto.scheduledAt, user);
  }

  @Post(':id/send')
  @RequirePermission('Campaign', 'approve')
  send(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.send(id, user);
  }

  @Post('engagement')
  @RequirePermission('Campaign', 'update')
  engagement(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.recordEngagement(dto, user);
  }

  @Get(':id/roi')
  @RequirePermission('Campaign', 'read')
  roi(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.getRoi(id, user.companyId);
  }
}
