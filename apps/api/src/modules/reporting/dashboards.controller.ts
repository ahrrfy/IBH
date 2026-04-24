import { Controller, Get, Param, Query } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { CurrentUser } from '../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get('executive')
  @RequirePermission('Dashboard', 'read')
  executive(@CurrentUser() session: UserSession) {
    return this.dashboards.executiveDashboard(session.companyId);
  }

  @Get('operations')
  @RequirePermission('Dashboard', 'read')
  operations(@CurrentUser() session: UserSession, @Query('branchId') branchId?: string) {
    return this.dashboards.operationsDashboard(session.companyId, branchId);
  }

  @Get('finance')
  @RequirePermission('Dashboard', 'read')
  finance(@CurrentUser() session: UserSession) {
    return this.dashboards.financeDashboard(session.companyId);
  }

  @Get('branch/:branchId')
  @RequirePermission('Dashboard', 'read')
  branch(@CurrentUser() session: UserSession, @Param('branchId') branchId: string) {
    return this.dashboards.branchDashboard(session.companyId, branchId);
  }

  @Get('hr')
  @RequirePermission('Dashboard', 'read')
  hr(@CurrentUser() session: UserSession) {
    return this.dashboards.hrDashboard(session.companyId);
  }
}
