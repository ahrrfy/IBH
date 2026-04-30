import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PeriodCloseService } from './period-close.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('finance/periods')
export class PeriodCloseController {
  constructor(private readonly svc: PeriodCloseService) {}

  @Get()
  @RequirePermission('Period', 'read')
  list(
    @CurrentUser() session: UserSession,
    @Query('year') year?: string,
  ) {
    return this.svc.listPeriods(session.companyId, year ? Number(year) : undefined);
  }

  @Get('status')
  @RequirePermission('Period', 'close')
  status(
    @CurrentUser() session: UserSession,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    // I064 — default to current UTC month when params missing. Previously
    // Number(undefined) → NaN → invalid Date filter → Prisma 500.
    const now = new Date();
    const y = year ? Number(year) : now.getUTCFullYear();
    const m = month ? Number(month) : now.getUTCMonth() + 1;
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
      const fallbackY = now.getUTCFullYear();
      const fallbackM = now.getUTCMonth() + 1;
      return this.svc.status(session.companyId, fallbackY, fallbackM);
    }
    return this.svc.status(session.companyId, y, m);
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
