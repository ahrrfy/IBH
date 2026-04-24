import { Controller, Get, Query } from '@nestjs/common';
import { FinancialReportsService } from './financial-reports.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('finance/reports')
export class FinancialReportsController {
  constructor(private readonly svc: FinancialReportsService) {}

  @Get('balance-sheet')
  @RequirePermission('FinancialReport', 'read')
  balanceSheet(
    @CurrentUser() session: UserSession,
    @Query('asOf') asOf?: string,
  ) {
    return this.svc.balanceSheet(
      session.companyId,
      asOf ? new Date(asOf) : new Date(),
    );
  }

  @Get('income-statement')
  @RequirePermission('FinancialReport', 'read')
  incomeStatement(
    @CurrentUser() session: UserSession,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.svc.incomeStatement(session.companyId, {
      from: new Date(from),
      to: new Date(to),
    });
  }

  @Get('cash-flow')
  @RequirePermission('FinancialReport', 'read')
  cashFlow(
    @CurrentUser() session: UserSession,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.svc.cashFlow(session.companyId, {
      from: new Date(from),
      to: new Date(to),
    });
  }

  @Get('equity')
  @RequirePermission('FinancialReport', 'read')
  equity(
    @CurrentUser() session: UserSession,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.svc.statementOfEquity(session.companyId, {
      from: new Date(from),
      to: new Date(to),
    });
  }
}
