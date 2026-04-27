/**
 * Super-admin licensing dashboard endpoints (T63).
 *
 * All routes are gated by RequirePermission('License', 'admin') which the
 * RbacGuard satisfies for users with the 'super_admin' role. They are
 * mounted under /api/v1/admin/licensing/* per task scope.
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AdminLicensingService,
  type SubscriptionStatusFilter,
} from './admin-licensing.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('admin/licensing')
@RequirePermission('License', 'admin')
export class AdminLicensingController {
  constructor(private readonly admin: AdminLicensingService) {}

  @Get('tenants')
  listTenants(@Query() q: any) {
    return this.admin.listTenants({
      status: q.status as SubscriptionStatusFilter | undefined,
      search: q.search,
      skip: q.skip ? Number(q.skip) : undefined,
      take: q.take ? Number(q.take) : undefined,
    });
  }

  @Get('tenants/:id')
  getTenant(@Param('id') id: string) {
    return this.admin.getTenantDetail(id);
  }

  @Patch('tenants/:id/status')
  setStatus(
    @Param('id') id: string,
    @Body() body: { status: 'active' | 'suspended'; reason?: string },
    @CurrentUser() session: UserSession,
  ) {
    return this.admin.setStatus(id, body.status, body.reason, session);
  }

  @Patch('tenants/:id/plan')
  changePlan(
    @Param('id') id: string,
    @Body() body: { planId: string },
    @CurrentUser() session: UserSession,
  ) {
    return this.admin.changePlan(id, body.planId, session);
  }

  @Post('tenants/:id/extend-trial')
  extendTrial(
    @Param('id') id: string,
    @Body() body: { extraDays: number },
    @CurrentUser() session: UserSession,
  ) {
    return this.admin.extendTrial(id, body.extraDays, session);
  }

  @Get('plans')
  listPlans() {
    return this.admin.listPlans();
  }

  @Get('audit')
  listAudit(@Query() q: any) {
    return this.admin.listEvents({
      subscriptionId: q.subscriptionId,
      skip: q.skip ? Number(q.skip) : undefined,
      take: q.take ? Number(q.take) : undefined,
    });
  }
}
