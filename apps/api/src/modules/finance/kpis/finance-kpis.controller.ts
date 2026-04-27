import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';
import { FinanceKpisService } from './finance-kpis.service';

/**
 * T50 — read-only KPIs aggregator endpoint.
 * Permission piggybacks on FinancialReport.read since the data is a strict
 * subset of what the income statement / AR aging reports already expose.
 */
@Controller('finance/kpis')
export class FinanceKpisController {
  constructor(private readonly svc: FinanceKpisService) {}

  @Get('dashboard')
  @RequirePermission('FinancialReport', 'read')
  dashboard(
    @CurrentUser() session: UserSession,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.getDashboard(session.companyId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}
