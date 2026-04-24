import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('crm/pipeline')
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @Get()
  @RequirePermission('Lead', 'read')
  view(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.pipeline.pipelineView(session.companyId, { filter: q.filter, assignedTo: q.assignedTo });
  }

  @Post('move/:leadId')
  @RequirePermission('Lead', 'update')
  move(
    @Param('leadId') leadId: string,
    @Body() dto: { toStatus: any; customerId?: string; lostReason?: string },
    @CurrentUser() session: UserSession,
  ) {
    return this.pipeline.moveLead(leadId, dto.toStatus, session, { customerId: dto.customerId, lostReason: dto.lostReason });
  }

  @Get('forecast')
  @RequirePermission('Lead', 'read')
  forecast(@CurrentUser() session: UserSession, @Query('months') months?: string) {
    return this.pipeline.forecast(session.companyId, months ? Number(months) : 3);
  }
}
