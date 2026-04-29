import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('crm/activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  // I047 — list endpoint for /crm/activities (was 404 before).
  @Get()
  @RequirePermission('Lead', 'read')
  list(
    @CurrentUser() session: UserSession,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.activities.list(session.companyId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post()
  @RequirePermission('Lead', 'update')
  create(@Body() dto: any, @CurrentUser() session: UserSession) {
    return this.activities.create(dto, session);
  }

  @Post(':id/complete')
  @RequirePermission('Lead', 'update')
  complete(@Param('id') id: string, @Body() dto: { outcome?: string }, @CurrentUser() session: UserSession) {
    return this.activities.complete(id, dto, session);
  }

  @Get('by-lead/:leadId')
  @RequirePermission('Lead', 'read')
  byLead(@Param('leadId') leadId: string, @CurrentUser() session: UserSession) {
    return this.activities.findByLead(leadId, session.companyId);
  }

  @Get('reminders')
  @RequirePermission('Lead', 'read')
  reminders(@CurrentUser() session: UserSession, @Query('userId') userId?: string) {
    return this.activities.upcomingReminders(userId ?? session.userId, session.companyId);
  }
}
