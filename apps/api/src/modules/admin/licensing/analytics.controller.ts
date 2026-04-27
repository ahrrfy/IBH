/**
 * T67 — Super-admin license analytics endpoints.
 *
 * Mounted under /api/v1/admin/licensing/analytics/*. Same RBAC gate as
 * the rest of the admin licensing module: super-admin only.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import { AdminLicensingAnalyticsService } from './analytics.service';

@Controller('admin/licensing/analytics')
@RequirePermission('License', 'admin')
export class AdminLicensingAnalyticsController {
  constructor(private readonly analytics: AdminLicensingAnalyticsService) {}

  /** Single-figure dashboard summary for the current month. */
  @Get('summary')
  summary() {
    return this.analytics.getSummary();
  }

  /** Last N months of MRR / churn / expansion / new MRR. Default 12. */
  @Get('timeseries')
  timeseries(@Query('months') months?: string) {
    const m = months ? Number(months) : 12;
    return this.analytics.getTimeseries(Number.isFinite(m) ? m : 12);
  }

  /** Current MRR distribution across plans. */
  @Get('breakdown')
  breakdown() {
    return this.analytics.getBreakdown();
  }
}
