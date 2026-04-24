import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PeriodCloseService } from './period-close.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('finance/periods')
export class PeriodCloseController {
  constructor(private readonly svc: PeriodCloseService) {}

  @Get('status')
  @RequirePermission('Period', 'close')
  status(
    @CurrentUser() session: UserSession,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.svc.status(session.companyId, Number(year), Number(month));
  }

  @Post('close/start')
  @RequirePermission('Period', 'close')
  start(
    @Body() body: { year: number; month: number },
    @CurrentUser() session: UserSession,
  ) {
    return this.svc.startClose(session.companyId, body.year, body.month, session);
  }

  @Post('close/:id/step/:step')
  @RequirePermission('Period', 'close')
  step(
    @Param('id') id: string,
    @Param('step') step: string,
    @CurrentUser() session: UserSession,
  ) {
    return this.svc.close(id, Number(step), session);
  }

  @Post(':id/reopen')
  @RequirePermission('Period', 'reopen')
  reopen(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() session: UserSession,
  ) {
    return this.svc.reopen(id, body.reason, session);
  }
}
