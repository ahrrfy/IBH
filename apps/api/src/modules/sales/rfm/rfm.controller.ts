import { Controller, Post, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { RfmService } from './rfm.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

/**
 * T44 — Manual triggers for RFM recompute. The standard schedule is the
 * nightly Bull job — these endpoints are for ops/testing.
 */
@Controller('sales/rfm')
export class RfmController {
  constructor(private readonly svc: RfmService) {}

  /** Recompute every customer in the caller's company. */
  @Post('recompute')
  @RequirePermission('Customer', 'update')
  @HttpCode(HttpStatus.OK)
  async recomputeAll(@CurrentUser() user: UserSession) {
    const n = await this.svc.recomputeForCompany(user.companyId);
    return { companyId: user.companyId, customersUpdated: n };
  }

  /** Recompute one customer (used after a posted invoice or returns). */
  @Post('recompute/:customerId')
  @RequirePermission('Customer', 'update')
  @HttpCode(HttpStatus.OK)
  async recomputeOne(
    @CurrentUser() user: UserSession,
    @Param('customerId') customerId: string,
  ) {
    return this.svc.recomputeOne(user.companyId, customerId);
  }
}
